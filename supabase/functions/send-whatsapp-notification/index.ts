// Automated tenant-facing WhatsApp messages (trial-reminder sequence today,
// same idea as send-tenant-email's templates but over WhatsApp instead of
// SMTP). Called by pg_cron (service-role bearer token, no interactive
// caller) the same way notify_trial_reminders() already calls
// send-tenant-email -- see 1786030000_trial_reminder_notifications.sql /
// 1786050000_trial_discount_day4.sql.
//
// WhatsApp only allows a free-form message within 24h of the customer
// messaging first -- anything business-initiated outside that window (which
// every one of these automated sends is) legally/technically requires a
// pre-approved message template. Real template names only exist once
// Meta approves them, so each one is read from its own env var and this
// no-ops (not an error -- the email leg of the same reminder still goes
// out) until that's configured, same "not set up yet" pattern as
// Stripe/Paynow/SMTP elsewhere in this app.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Maps this app's own template keys to the env var holding the actual
// Meta-approved template name for each -- add more keys here as more
// automated WhatsApp messages are wired up, no code changes needed beyond
// this map plus setting the secret once the template's approved.
const TEMPLATE_ENV_KEYS: Record<string, string> = {
  trial_reminder: 'WHATSAPP_TEMPLATE_TRIAL_REMINDER',
  trial_reminder_discount: 'WHATSAPP_TEMPLATE_TRIAL_REMINDER_DISCOUNT',
}

function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  return digits.length >= 9 ? digits : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Same caller check as send-tenant-email: platform staff via a real
    // JWT, or the service-role cron path (no caller resolved at all).
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (caller) {
      const { data: appUser } = await admin.from('app_users').select('role').eq('id', caller.id).maybeSingle()
      if (!appUser || !['super_admin', 'admin'].includes(appUser.role)) {
        return json({ error: 'Not authorized' }, 403)
      }
    }

    const { phone, template, template_params } = await req.json()
    if (!phone || !template) return json({ error: 'phone and template are required' }, 400)

    const to = normalizePhone(phone)
    if (!to) return json({ error: 'Invalid phone number', skipped: true }, 200)

    const templateEnvKey = TEMPLATE_ENV_KEYS[template]
    if (!templateEnvKey) return json({ error: `Unknown template ${template}` }, 400)

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    const templateName = Deno.env.get(templateEnvKey)
    if (!accessToken || !phoneNumberId || !templateName) {
      // Not an error -- this is the expected state until WhatsApp is set
      // up and this specific template is approved. The cron caller
      // (notify_trial_reminders) doesn't treat this as a failure; the
      // email leg of the same reminder already went out regardless.
      return json({ skipped: true, reason: 'WhatsApp not configured for this template yet' }, 200)
    }

    const params = Array.isArray(template_params) ? template_params : []
    const waRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en_US' },
          ...(params.length > 0
            ? { components: [{ type: 'body', parameters: params.map((p: string) => ({ type: 'text', text: String(p) })) }] }
            : {}),
        },
      }),
    })
    const waJson = await waRes.json()
    if (!waRes.ok) return json({ error: waJson?.error?.message || 'WhatsApp declined to send this message' }, 502)

    return json({ sent: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

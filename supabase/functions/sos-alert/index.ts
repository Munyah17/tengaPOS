// Silent panic/duress alert. Deliberately self-contained (not routed
// through send-tenant-email/send-whatsapp-notification) -- those two are
// built around ONE canonical recipient per tenant (the vendor) and reject
// any caller that isn't platform staff or their own service-role cron
// path; an SOS needs to reach every manager (vendor + shop_managers) at
// once, and it needs to work from a real cashier's own session, right
// now, with zero visible round trip on their screen.
//
// Called fire-and-forget from POS.jsx -- the caller never awaits a
// result or shows any UI change, by design (see 1786300000's comment on
// sos_alerts RLS). Money/hardware never touch this function; it only
// ever inserts a log row and best-effort notifies.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function sendMail(to: string, subject: string, body: string) {
  const host = Deno.env.get('SMTP_HOST')
  const port = Number(Deno.env.get('SMTP_PORT') || 587)
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  const from = Deno.env.get('SMTP_FROM') || user
  if (!host || !user || !pass) throw new Error('SMTP not configured')
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } })
  await client.send({ from: from!, to, subject, content: body })
  await client.close()
}

function normalizePhone(raw: string | null): string | null {
  const digits = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  return digits.length >= 9 ? digits : null
}

// Own WhatsApp template, same "no-op until Meta approves it and the env
// var is set" pattern as every other template in this app -- the email
// leg still goes out regardless of whether this one's configured yet.
async function sendWhatsApp(phone: string, tenantName: string, branchName: string, when: string) {
  const to = normalizePhone(phone)
  if (!to) return
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const templateName = Deno.env.get('WHATSAPP_TEMPLATE_SOS_ALERT')
  if (!accessToken || !phoneNumberId || !templateName) return
  await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [tenantName, branchName, when].map((t) => ({ type: 'text', text: t })) }],
      },
    }),
  }).catch(() => { /* best-effort -- the SOS log row + email are what matter */ })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // A real tenant user's own JWT -- any POS-access role can trigger
    // this (exactly the roles who'd ever be alone at a till).
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (!caller) return json({ error: 'Not authenticated' }, 401)

    const { data: callerRow } = await admin.from('users').select('tenant_id, branch_id, name').eq('id', caller.id).maybeSingle()
    if (!callerRow?.tenant_id) return json({ error: 'Not authorized' }, 403)

    const { branch_id } = await req.json().catch(() => ({}))
    const branchId = branch_id || callerRow.branch_id || null

    const [{ data: tenant }, { data: branch }, { data: recipients }] = await Promise.all([
      admin.from('tenants').select('name').eq('id', callerRow.tenant_id).maybeSingle(),
      branchId ? admin.from('branches').select('name').eq('id', branchId).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('users').select('email, phone').eq('tenant_id', callerRow.tenant_id).in('role', ['vendor', 'shop_manager']),
    ])

    const { data: alert, error: insertErr } = await admin
      .from('sos_alerts')
      .insert({ tenant_id: callerRow.tenant_id, branch_id: branchId, triggered_by: caller.id })
      .select('id')
      .single()
    if (insertErr) throw insertErr

    const tenantName = tenant?.name || 'Your business'
    const branchName = branch?.name || 'Main'
    const when = new Date().toLocaleString()
    const subject = `⚠ SOS alert -- ${tenantName}${branch?.name ? ` (${branch.name})` : ''}`
    const body = `An SOS/panic alert was triggered on the till at ${branchName} by ${callerRow.name || 'a staff member'} at ${when}.\n\nThis needs immediate attention -- check on the branch now.`

    // Best-effort, every recipient, in parallel -- one bad email/phone
    // never blocks the rest, and none of it blocks the response back to
    // the till either.
    await Promise.allSettled((recipients || []).flatMap((r) => [
      r.email ? sendMail(r.email, subject, body) : Promise.resolve(),
      r.phone ? sendWhatsApp(r.phone, tenantName, branchName, when) : Promise.resolve(),
    ]))

    return json({ ok: true, alertId: alert?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Still a 200-shaped failure from the caller's point of view is wrong
    // here -- but the caller never looks at the response either way (see
    // POS.jsx's fire-and-forget call), so this only matters for whoever
    // reads Edge Function Logs afterward.
    return json({ error: msg }, 500)
  }
})

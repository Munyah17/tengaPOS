// Sends tenant-facing transactional emails (application approved/rejected/
// stalled, suspended/reinstated, and a daily digest of config changes still
// awaiting the Vendor's approval) via SMTP — the mailbox credentials the
// business owner already has, not a new third-party service.
//
// Two call shapes:
//   { tenant_id, template, extra? }  — one tenant, called right after a
//                                      Super Admin decision or Vendor action
//   { mode: 'daily_digest' }         — every tenant with something pending,
//                                      called once daily by pg_cron
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

const CONFIG_AREA_LABEL: Record<string, string> = { general: 'General Settings', receipts_config: 'Receipts Config' }

function template(name: string, tenantName: string, extra: Record<string, unknown> = {}) {
  const templates: Record<string, { subject: string; body: string }> = {
    approved: {
      subject: `${tenantName} is approved — welcome to tengaPOS`,
      body: `Good news — your business, ${tenantName}, has been approved and is now active on tengaPOS. You can sign in and start trading right away.`,
    },
    rejected: {
      subject: `Update on your tengaPOS application`,
      body: `Your application for ${tenantName} wasn't approved.${extra.reason ? `\n\nReason: ${extra.reason}` : ''}\n\nIf you have questions, reply to this email or reach us on WhatsApp.`,
    },
    stalled: {
      subject: `A little more information needed — ${tenantName}`,
      body: `We need a bit more information before we can approve ${tenantName}.${extra.reason ? `\n\n${extra.reason}` : ''}\n\nReply to this email or reach us on WhatsApp and we'll pick it back up.`,
    },
    suspended: {
      subject: `${tenantName} access suspended`,
      body: `Access to your tengaPOS account for ${tenantName} has been suspended. Contact support if this is unexpected.`,
    },
    reinstated: {
      subject: `${tenantName} access restored`,
      body: `Your tengaPOS account for ${tenantName} is active again — you can sign in as usual.`,
    },
    pending_change_reminder: {
      subject: `Action needed: ${extra.count} change${extra.count === 1 ? '' : 's'} awaiting your approval — ${tenantName}`,
      body: `${extra.count} change${extra.count === 1 ? '' : 's'} made by your team ${extra.count === 1 ? 'is' : 'are'} still awaiting your approval on tengaPOS, and will automatically revert if not approved in time:\n\n${extra.lines}\n\nSign in to Settings > Requests to review.`,
    },
    credentials_reset: {
      subject: `Your tengaPOS password was reset — ${tenantName}`,
      body: `Your tengaPOS sign-in for ${tenantName} was reset by our support team.\n\nEmail: ${extra.email}\nTemporary password: ${extra.password}\n\nPlease sign in and change this password as soon as you can. If you didn't expect this, contact us right away.`,
    },
    new_signup: {
      subject: `Welcome to tengaPOS, ${tenantName}!`,
      body: `Hi,\n\nYour tengaPOS account for ${tenantName} has been created. Sign in any time to get started.\n\nIf you have questions, reply to this email or reach us on WhatsApp.`,
    },
    new_signup_admin: {
      subject: `New signup: ${tenantName}`,
      body: `${tenantName} just signed up for tengaPOS.\n\nOwner: ${extra.ownerName || '—'}\nEmail: ${extra.ownerEmail || '—'}\nPhone: ${extra.ownerPhone || '—'}\n\nReview it in the Super Admin portal.`,
    },
    trial_expired: {
      subject: `Your tengaPOS free trial has ended — ${tenantName}`,
      body: `Your 7-day free trial for ${tenantName} has ended and access has been paused. Pick a plan any time to pick up right where you left off — sign in to see your options.`,
    },
    trial_expired_admin: {
      subject: `Trial expired: ${tenantName}`,
      body: `${tenantName}'s 7-day free trial just ended with no plan selected, and their account has been suspended.\n\nOwner: ${extra.ownerName || '—'}\nEmail: ${extra.ownerEmail || '—'}\nPhone: ${extra.ownerPhone || '—'}\n\nFollow up if you want to try converting them.`,
    },
    // Daily reminder sequence, days 1-2 -- see notify_trial_reminders().
    trial_reminder: {
      subject: `Reminder: your tengaPOS trial has ended — ${tenantName}`,
      body: `Your 7-day free trial for ${tenantName} ended and access is paused. Your data is safe and waiting for you -- pick a plan any time to pick up right where you left off. Sign in to see your options.`,
    },
    // Days 3-5 -- same reminder, now with the automatic discount.
    // trial_discount_expires_at is what actually gates the price at
    // checkout; this copy just tells them it's there, no code needed.
    trial_reminder_discount: {
      subject: `10% off to come back — ${tenantName}'s trial has ended`,
      body: `Your 7-day free trial for ${tenantName} ended and access is paused. Your data is safe and waiting for you.\n\nAs a thank you for trying tengaPOS, we've applied a 10% discount to your account automatically -- no code needed, it's already applied when you sign in and choose a plan. This offer won't stay up forever, so it's worth doing sooner rather than later.\n\n(Day ${extra.day} of this reminder.)`,
    },
  }
  return templates[name] || null
}

// These two go to the admin's own SMTP mailbox instead of the tenant owner
// — a heads-up to act on, not a tenant-facing email.
const ADMIN_ALERT_TEMPLATES = new Set(['new_signup_admin', 'trial_expired_admin'])

async function sendMail(to: string, subject: string, body: string) {
  const host = Deno.env.get('SMTP_HOST')
  const port = Number(Deno.env.get('SMTP_PORT') || 587)
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  const from = Deno.env.get('SMTP_FROM') || user
  if (!host || !user || !pass) throw new Error('SMTP not configured')

  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  })
  await client.send({ from: from!, to, subject, content: body })
  await client.close()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()

    if (body.mode === 'daily_digest') {
      const { data: pending } = await admin
        .from('pending_config_changes')
        .select('tenant_id, config_area, expires_at, tenants(name)')
        .eq('status', 'pending')
      const byTenant = new Map<string, { name: string; lines: string[] }>()
      for (const row of pending || []) {
        const hoursLeft = Math.max(0, Math.round((new Date(row.expires_at).getTime() - Date.now()) / 3600000))
        const entry = byTenant.get(row.tenant_id) || { name: (row as any).tenants?.name || 'Your business', lines: [] }
        entry.lines.push(`- ${CONFIG_AREA_LABEL[row.config_area] || row.config_area} (reverts in ${hoursLeft}h)`)
        byTenant.set(row.tenant_id, entry)
      }

      let sent = 0
      const errors: string[] = []
      for (const [tenantId, entry] of byTenant) {
        const { data: owner } = await admin.from('users').select('email').eq('tenant_id', tenantId).eq('role', 'vendor').maybeSingle()
        if (!owner?.email) continue
        const t = template('pending_change_reminder', entry.name, { count: entry.lines.length, lines: entry.lines.join('\n') })
        try {
          await sendMail(owner.email, t!.subject, t!.body)
          sent += 1
        } catch (err) {
          errors.push(`${tenantId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return json({ sent, tenants: byTenant.size, errors })
    }

    const { tenant_id, template: templateName, extra } = body
    if (!tenant_id || !templateName) return json({ error: 'tenant_id and template are required' }, 400)

    // Caller must be platform staff (Super Admin/Admin) or the pg_cron
    // service-role call — never trust a client-supplied recipient address.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (caller) {
      const { data: appUser } = await admin.from('app_users').select('role').eq('id', caller.id).maybeSingle()
      if (!appUser || !['super_admin', 'admin'].includes(appUser.role)) {
        return json({ error: 'Not authorized' }, 403)
      }
    }
    // (no caller + valid service-role JWT falls through here — that's the cron path)

    const [{ data: tenant }, { data: owner }] = await Promise.all([
      admin.from('tenants').select('name').eq('id', tenant_id).maybeSingle(),
      admin.from('users').select('email, name, phone').eq('tenant_id', tenant_id).eq('role', 'vendor').maybeSingle(),
    ])

    const isAdminAlert = ADMIN_ALERT_TEMPLATES.has(templateName)
    const recipient = isAdminAlert ? (Deno.env.get('SMTP_FROM') || Deno.env.get('SMTP_USER')) : owner?.email
    if (!recipient) {
      return json({ error: isAdminAlert ? 'Admin notification address not configured (SMTP_FROM/SMTP_USER)' : 'No owner email found for this tenant' }, 404)
    }

    const t = template(templateName, tenant?.name || 'Your business', {
      ...(extra || {}), ownerName: owner?.name, ownerEmail: owner?.email, ownerPhone: owner?.phone,
    })
    if (!t) return json({ error: `Unknown template ${templateName}` }, 400)

    await sendMail(recipient, t.subject, t.body)
    return json({ sent: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

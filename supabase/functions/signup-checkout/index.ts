// Subscription checkout session creator.
// The app NEVER touches card details or payment credentials:
// this function creates a hosted checkout session (Stripe or Paynow)
// and returns the redirect URL. Webhooks confirm payment and
// activate the tenant's plan.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Fallback prices — live prices come from platform_settings (Super Admin editable).
// The client can never set its own amount.
const FALLBACK_PLAN_PRICES: Record<string, { price: number; renewalMonths: number }> = {
  byod_monthly:  { price: 60,  renewalMonths: 1 },
  byod_yearly:   { price: 600, renewalMonths: 12 },
  standard_plan: { price: 170, renewalMonths: 6 },
  pro_package:   { price: 200, renewalMonths: 6 },
}
// Optional, BYOD only -- the in-app self-serve onboarding stays free either way.
const BYOD_ONBOARDING_FEE = 30
// Standard/Pro's hardware (tablet + printer) stays a once-off payment --
// this is a NEW, separate, ongoing hosting subscription on top of it, new
// signups only. Priced per plan since Pro's is higher.
const HOSTING_PRICES: Record<string, { monthly: number; yearly: number }> = {
  standard_plan: { monthly: 20, yearly: 200 },
  pro_package:   { monthly: 35, yearly: 300 },
}
const FALLBACK_FISCAL_PRICES: Record<string, { price: number; months: number; label: string }> = {
  monthly:   { price: 20,  months: 1,  label: 'Monthly' },
  quarterly: { price: 50,  months: 3,  label: '3 Months' },
  halfyear:  { price: 90,  months: 6,  label: '6 Months' },
  yearly:    { price: 170, months: 12, label: 'Yearly' },
}
const PERIOD_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 }
const PERIOD_LABEL: Record<string, string> = { monthly: 'Monthly', quarterly: '3 Months', halfyear: '6 Months', yearly: 'Yearly' }
const ACCOUNTING_ERP_PRICES: Record<string, number> = { monthly: 5, quarterly: 13, halfyear: 24, yearly: 45 }
const AI_INSIGHTS_PRICES: Record<string, number> = { monthly: 1, quarterly: 3, halfyear: 5, yearly: 9 }
// Only monthly/yearly -- no quarterly/halfyear tier was asked for.
const WHATSAPP_RECEIPTS_PRICES: Record<string, number> = { monthly: 5, yearly: 50 }
const PLAN_LABELS: Record<string, string> = {
  byod_monthly: 'tengaPOS BYOD Monthly (1 month)',
  byod_yearly: 'tengaPOS BYOD Yearly (12 months)',
  standard_plan: 'tengaPOS Standard Plan (once-off hardware, 6 months included)',
  pro_package: 'tengaPOS Pro Package (once-off hardware, 6 months included)',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function sha512(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Caller must be a signed-in tenant user
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    const { plan_type, provider, return_url, type, period, invoice_id, onboarding } = await req.json()
    if (!['stripe', 'paynow', 'cash'].includes(provider)) return json({ error: 'provider must be stripe, paynow, or cash' }, 400)

    const isFiscal = type === 'fiscalisation'
    const isAccountingErp = type === 'accounting_erp'
    const isAiInsights = type === 'ai_insights'
    const isWhatsappReceipts = type === 'whatsapp_receipts'
    const isHosting = type === 'hosting'
    const isPlatformInvoice = type === 'platform_invoice'

    // Resolve the caller's tenant server-side — never trust a client tenant_id
    const { data: userRow } = await admin
      .from('users')
      .select('tenant_id, email, tenants(name, plan_type, trial_discount_expires_at)')
      .eq('id', caller.id)
      .single()
    if (!userRow?.tenant_id) return json({ error: 'No tenant found for this account' }, 400)
    const tenantId = userRow.tenant_id

    // Live pricing from platform_settings (Super Admin controlled)
    let plan: { amount: number; label: string; months: number } | null = null
    let platformInvoice: { id: string } | null = null
    if (isPlatformInvoice) {
      // Cash claims never come through here — they go straight to
      // request_platform_invoice_cash_confirmation from the tenant's own
      // authenticated session, no service role needed for that path.
      if (provider === 'cash') return json({ error: 'Use the "paid by cash/transfer" option instead' }, 400)
      if (!invoice_id) return json({ error: 'Missing invoice_id' }, 400)
      const { data: inv } = await admin.from('platform_invoices').select('*').eq('id', invoice_id).maybeSingle()
      if (!inv || inv.tenant_id !== tenantId) return json({ error: 'Invoice not found' }, 404)
      if (!['sent', 'overdue'].includes(inv.status)) return json({ error: 'This invoice is not payable' }, 400)
      // Amount/label always come from the invoice row itself — never from
      // the client — same principle as every other branch here.
      plan = { amount: Number(inv.amount), label: inv.description, months: 0 }
      platformInvoice = { id: inv.id }
    } else if (isFiscal) {
      const { data: fp } = await admin.from('platform_settings').select('value').eq('key', 'fiscalisation_pricing').maybeSingle()
      const table = { ...FALLBACK_FISCAL_PRICES, ...((fp?.value as Record<string, { price: number; months: number; label: string }>) || {}) }
      const p = table[period as string]
      if (!p) return json({ error: 'Invalid fiscalisation period' }, 400)
      plan = { amount: p.price, label: `ZIMRA Fiscalisation — ${p.label}`, months: p.months }
    } else if (isAccountingErp) {
      const months = PERIOD_MONTHS[period as string]
      const price = ACCOUNTING_ERP_PRICES[period as string]
      if (!months || !price) return json({ error: 'Invalid Accounting & ERP period' }, 400)
      plan = { amount: price, label: `Accounting & ERP — ${PERIOD_LABEL[period as string]}`, months }
    } else if (isAiInsights) {
      const months = PERIOD_MONTHS[period as string]
      const price = AI_INSIGHTS_PRICES[period as string]
      if (!months || !price) return json({ error: 'Invalid AI Insights period' }, 400)
      plan = { amount: price, label: `AI Insights — ${PERIOD_LABEL[period as string]}`, months }
    } else if (isWhatsappReceipts) {
      const months = PERIOD_MONTHS[period as string]
      const price = WHATSAPP_RECEIPTS_PRICES[period as string]
      if (!months || !price) return json({ error: 'Invalid WhatsApp Receipts period' }, 400)
      plan = { amount: price, label: `WhatsApp Receipts — ${PERIOD_LABEL[period as string]}`, months }
    } else if (isHosting) {
      // Hosting price depends on which hardware plan this tenant is
      // actually on (Pro's is higher) -- read from the tenant row itself,
      // never trust a client-supplied plan for pricing.
      const tenantPlanType = (userRow.tenants as { plan_type?: string } | null)?.plan_type
      const hostingTable = tenantPlanType ? HOSTING_PRICES[tenantPlanType] : undefined
      if (!hostingTable) return json({ error: 'Hosting is only for Standard/Pro hardware plans' }, 400)
      const months = period === 'yearly' ? 12 : period === 'monthly' ? 1 : 0
      const price = period === 'yearly' ? hostingTable.yearly : period === 'monthly' ? hostingTable.monthly : undefined
      if (!months || !price) return json({ error: 'Invalid hosting period' }, 400)
      plan = { amount: price, label: `tengaPOS Hosting — ${PERIOD_LABEL[period as string]}`, months }
    } else {
      const { data: pp } = await admin.from('platform_settings').select('value').eq('key', 'plan_pricing').maybeSingle()
      const table = { ...FALLBACK_PLAN_PRICES, ...((pp?.value as Record<string, { price: number; renewalMonths: number }>) || {}) }
      const p = table[plan_type as string]
      if (!p?.price) return json({ error: 'Business and Enterprise plans are quoted — contact sales' }, 400)
      let amount = p.price
      let label = PLAN_LABELS[plan_type] || `tengaPOS ${plan_type}`
      // Optional physical onboarding -- BYOD only. The in-app self-serve
      // onboarding walkthrough stays free either way.
      if (onboarding && String(plan_type).startsWith('byod')) {
        amount += BYOD_ONBOARDING_FEE
        label += ' + physical onboarding'
      }
      // Automatic post-trial win-back discount -- set by
      // notify_trial_reminders() on day 3 of the reminder sequence, no
      // promo code involved. Checkout.jsx shows the same discounted price
      // before they pay; this is the actual amount charged.
      const discountExpiresAt = (userRow.tenants as { trial_discount_expires_at?: string } | null)?.trial_discount_expires_at
      if (discountExpiresAt && new Date(discountExpiresAt) > new Date()) {
        amount = Math.round(amount * 0.9 * 100) / 100
      }
      plan = { amount, label, months: p.renewalMonths }
    }

    const checkoutKind = isPlatformInvoice ? 'platform_invoice' : isFiscal ? 'fiscalisation' : isAccountingErp ? 'accounting_erp' : isAiInsights ? 'ai_insights' : isWhatsappReceipts ? 'whatsapp_receipts' : isHosting ? 'hosting' : 'plan'
    const planKey = isPlatformInvoice ? 'platform_invoice' : isFiscal ? `fiscal_${period}` : isAccountingErp ? `erp_${period}` : isAiInsights ? `ai_${period}` : isWhatsappReceipts ? `wa_${period}` : isHosting ? `hosting_${period}` : plan_type
    const refPrefix = isPlatformInvoice ? 'PINV' : isFiscal ? 'FIS' : isAccountingErp ? 'ERP' : isAiInsights ? 'AI' : isWhatsappReceipts ? 'WA' : isHosting ? 'HOST' : 'SUB'
    const reference = `${refPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const amountStr = plan.amount.toFixed(2)
    const returnUrl = return_url || 'https://www.tengapos.co.zw/checkout'

    // Cash only applies to the plan purchase at signup -- the paid add-ons
    // (fiscalisation/accounting_erp/ai_insights) already have their own
    // cash-request tables and Settings.jsx flows; don't create a second,
    // conflicting cash pathway for those here.
    if (provider === 'cash') {
      if (checkoutKind !== 'plan') {
        return json({ error: 'Cash requests for add-ons are submitted from Settings, not here' }, 400)
      }
      const { error: insertErr } = await admin.from('signup_checkouts').insert({
        tenant_id: tenantId,
        plan_type: planKey,
        provider: 'cash',
        reference,
        amount: plan.amount,
        currency: 'USD',
        status: 'pending_cash',
      })
      if (insertErr) return json({ error: insertErr.message }, 500)
      return json({ cash: true, reference })
    }

    let redirectUrl = ''
    let providerSessionId: string | null = null
    let pollUrl: string | null = null

    if (provider === 'stripe') {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeKey) {
        return json({ error: 'Stripe is not configured yet. Please pay with Paynow, or contact support.' }, 503)
      }

      const form = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(plan.amount * 100),
        'line_items[0][price_data][product_data][name]': plan.label,
        success_url: `${returnUrl}?provider=stripe&status=success&ref=${reference}`,
        cancel_url: `${returnUrl}?provider=stripe&status=cancelled&ref=${reference}`,
        client_reference_id: tenantId,
        customer_email: userRow.email || caller.email || '',
        'metadata[tenant_id]': tenantId,
        'metadata[plan_type]': planKey,
        'metadata[kind]': checkoutKind,
        'metadata[months]': String(plan.months),
        'metadata[reference]': reference,
        ...(platformInvoice ? { 'metadata[platform_invoice_id]': platformInvoice.id } : {}),
      })

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      })
      const session = await res.json()
      if (!res.ok) return json({ error: `Stripe: ${session?.error?.message || 'checkout failed'}` }, 400)

      redirectUrl = session.url
      providerSessionId = session.id
    } else {
      // Paynow — platform account credentials (not tenant credentials)
      const integId = Deno.env.get('PLATFORM_PAYNOW_ID')
      const integKey = Deno.env.get('PLATFORM_PAYNOW_KEY')
      if (!integId || !integKey) {
        return json({ error: 'Paynow is not configured yet. Please pay with card (Stripe), or contact support.' }, 503)
      }

      const additionalInfo = plan.label
      const resultUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paynow-signup-callback`
      const retUrl = `${returnUrl}?provider=paynow&status=returned&ref=${reference}`
      const statusField = 'Message'

      const hash = await sha512(
        integId + reference + amountStr + additionalInfo + retUrl + resultUrl + statusField + integKey,
      )

      const formData = {
        id: integId,
        reference,
        amount: amountStr,
        additionalinfo: additionalInfo,
        returnurl: retUrl,
        resulturl: resultUrl,
        status: statusField,
        hash,
      }

      // Paynow resets connections from Supabase's Edge/Deno Deploy IP
      // range (confirmed directly) -- relayed through a Vercel serverless
      // function on a different network instead. See api/paynow-proxy.js.
      const proxyUrl = Deno.env.get('PAYNOW_PROXY_URL')
      const proxySecret = Deno.env.get('PAYNOW_PROXY_SECRET')
      if (!proxyUrl || !proxySecret) {
        return json({ error: 'Paynow proxy is not configured yet. Please pay with card (Stripe), or contact support.' }, 503)
      }
      const proxyRes = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-proxy-secret': proxySecret },
        body: JSON.stringify({ targetUrl: 'https://www.paynow.co.zw/interface/initiatetransaction', formData }),
      })
      const proxyJson = await proxyRes.json()
      if (!proxyRes.ok) return json({ error: `Paynow proxy: ${proxyJson?.error || 'request failed'}` }, 502)
      const params = new URLSearchParams(proxyJson.body || '')
      if (params.get('status')?.toLowerCase() !== 'ok') {
        return json({ error: `Paynow: ${params.get('error') || 'could not start checkout'}` }, 400)
      }
      redirectUrl = params.get('browserurl') || ''
      pollUrl = params.get('pollurl')
    }

    if (platformInvoice) {
      await admin.from('platform_invoices').update({
        reference,
        provider_session_id: providerSessionId,
        poll_url: pollUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', platformInvoice.id)
    } else {
      await admin.from('signup_checkouts').insert({
        tenant_id: tenantId,
        plan_type: planKey,
        provider,
        provider_session_id: providerSessionId,
        reference,
        amount: plan.amount,
        currency: 'USD',
        status: 'redirected',
        poll_url: pollUrl,
      })
    }

    return json({ url: redirectUrl, reference })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

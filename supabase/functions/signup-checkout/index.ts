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
  byod_monthly:  { price: 30,  renewalMonths: 1 },
  standard_plan: { price: 170, renewalMonths: 6 },
  pro_package:   { price: 200, renewalMonths: 6 },
}
const FALLBACK_FISCAL_PRICES: Record<string, { price: number; months: number; label: string }> = {
  monthly:   { price: 20,  months: 1,  label: 'Monthly' },
  quarterly: { price: 50,  months: 3,  label: '3 Months' },
  halfyear:  { price: 90,  months: 6,  label: '6 Months' },
  yearly:    { price: 170, months: 12, label: 'Yearly' },
}
const PERIOD_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 }
const PERIOD_LABEL: Record<string, string> = { monthly: 'Monthly', quarterly: '3 Months', halfyear: '6 Months', yearly: 'Yearly' }
const ACCOUNTING_CRM_PRICES: Record<string, number> = { monthly: 5, quarterly: 13, halfyear: 24, yearly: 45 }
const AI_INSIGHTS_PRICES: Record<string, number> = { monthly: 1, quarterly: 3, halfyear: 5, yearly: 9 }
const PLAN_LABELS: Record<string, string> = {
  byod_monthly: 'tengaPOS BYOD Monthly (1 month)',
  standard_plan: 'tengaPOS Standard Plan (once-off, 6 months included)',
  pro_package: 'tengaPOS Pro Package (once-off, 6 months included)',
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

    const { plan_type, provider, return_url, type, period } = await req.json()
    if (!['stripe', 'paynow'].includes(provider)) return json({ error: 'provider must be stripe or paynow' }, 400)

    const isFiscal = type === 'fiscalisation'
    const isAccountingCrm = type === 'accounting_crm'
    const isAiInsights = type === 'ai_insights'

    // Live pricing from platform_settings (Super Admin controlled)
    let plan: { amount: number; label: string; months: number } | null = null
    if (isFiscal) {
      const { data: fp } = await admin.from('platform_settings').select('value').eq('key', 'fiscalisation_pricing').maybeSingle()
      const table = { ...FALLBACK_FISCAL_PRICES, ...((fp?.value as Record<string, { price: number; months: number; label: string }>) || {}) }
      const p = table[period as string]
      if (!p) return json({ error: 'Invalid fiscalisation period' }, 400)
      plan = { amount: p.price, label: `ZIMRA Fiscalisation — ${p.label}`, months: p.months }
    } else if (isAccountingCrm) {
      const months = PERIOD_MONTHS[period as string]
      const price = ACCOUNTING_CRM_PRICES[period as string]
      if (!months || !price) return json({ error: 'Invalid Accounting & CRM period' }, 400)
      plan = { amount: price, label: `Accounting & CRM — ${PERIOD_LABEL[period as string]}`, months }
    } else if (isAiInsights) {
      const months = PERIOD_MONTHS[period as string]
      const price = AI_INSIGHTS_PRICES[period as string]
      if (!months || !price) return json({ error: 'Invalid AI Insights period' }, 400)
      plan = { amount: price, label: `AI Insights — ${PERIOD_LABEL[period as string]}`, months }
    } else {
      const { data: pp } = await admin.from('platform_settings').select('value').eq('key', 'plan_pricing').maybeSingle()
      const table = { ...FALLBACK_PLAN_PRICES, ...((pp?.value as Record<string, { price: number; renewalMonths: number }>) || {}) }
      const p = table[plan_type as string]
      if (!p?.price) return json({ error: 'Business and Enterprise plans are quoted — contact sales' }, 400)
      plan = { amount: p.price, label: PLAN_LABELS[plan_type] || `tengaPOS ${plan_type}`, months: p.renewalMonths }
    }

    // Resolve the caller's tenant server-side — never trust a client tenant_id
    const { data: userRow } = await admin
      .from('users')
      .select('tenant_id, email, tenants(name)')
      .eq('id', caller.id)
      .single()
    if (!userRow?.tenant_id) return json({ error: 'No tenant found for this account' }, 400)

    const tenantId = userRow.tenant_id
    const checkoutKind = isFiscal ? 'fiscalisation' : isAccountingCrm ? 'accounting_crm' : isAiInsights ? 'ai_insights' : 'plan'
    const planKey = isFiscal ? `fiscal_${period}` : isAccountingCrm ? `crm_${period}` : isAiInsights ? `ai_${period}` : plan_type
    const refPrefix = isFiscal ? 'FIS' : isAccountingCrm ? 'CRM' : isAiInsights ? 'AI' : 'SUB'
    const reference = `${refPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const amountStr = plan.amount.toFixed(2)
    const returnUrl = return_url || 'https://www.tengapos.co.zw/checkout'

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

      const form = new URLSearchParams({
        id: integId,
        reference,
        amount: amountStr,
        additionalinfo: additionalInfo,
        returnurl: retUrl,
        resulturl: resultUrl,
        status: statusField,
        hash,
      })

      const res = await fetch('https://www.paynow.co.zw/interface/initiatetransaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      const params = new URLSearchParams(await res.text())
      if (params.get('status')?.toLowerCase() !== 'ok') {
        return json({ error: `Paynow: ${params.get('error') || 'could not start checkout'}` }, 400)
      }
      redirectUrl = params.get('browserurl') || ''
      pollUrl = params.get('pollurl')
    }

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

    return json({ url: redirectUrl, reference })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

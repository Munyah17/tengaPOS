// Stripe webhook — confirms hosted-checkout payments and activates plans.
// Verifies the Stripe-Signature header (HMAC-SHA256) before trusting anything.
// Deploy with --no-verify-jwt (Stripe cannot send a Supabase JWT).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAN_MONTHS: Record<string, number> = {
  byod_monthly: 1,
  standard_plan: 6,
  pro_package: 6,
}

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => kv.split('=') as [string, string]),
  )
  const timestamp = parts['t']
  const expected = parts['v1']
  if (!timestamp || !expected) return false

  // Reject events older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return computed === expected
}

serve(async (req) => {
  try {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!secret) return new Response('Webhook secret not configured', { status: 503 })

    const payload = await req.text()
    const sigHeader = req.headers.get('Stripe-Signature') || ''
    if (!(await verifyStripeSignature(payload, sigHeader, secret))) {
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(payload)
    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    const session = event.data.object
    const tenantId = session.metadata?.tenant_id
    const planType = session.metadata?.plan_type
    const reference = session.metadata?.reference
    if (!tenantId || !planType) return new Response('Missing metadata', { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const months = PLAN_MONTHS[planType] || 6
    const now = new Date()
    const renewal = new Date(now)
    renewal.setMonth(renewal.getMonth() + months)

    // Activate the tenant on the paid plan (clears any trial lock)
    await admin.from('tenants').update({
      status: 'active',
      plan_type: planType,
      plan_start_date: now.toISOString(),
      next_renewal_date: renewal.toISOString(),
      approved_at: now.toISOString(),
    }).eq('id', tenantId)

    // Mark checkout + record the payment
    const { data: checkout } = await admin
      .from('signup_checkouts')
      .update({ status: 'paid', updated_at: now.toISOString() })
      .eq('reference', reference)
      .select('id, amount')
      .maybeSingle()

    await admin.from('subscription_payments').insert({
      tenant_id: tenantId,
      checkout_id: checkout?.id || null,
      provider: 'stripe',
      provider_ref: session.payment_intent || session.id,
      plan_type: planType,
      amount: (session.amount_total ?? 0) / 100 || checkout?.amount || 0,
      currency: (session.currency || 'usd').toUpperCase(),
    })

    await admin.from('audit_logs').insert({
      action: 'subscription_paid',
      actor_email: 'stripe-webhook',
      target_type: 'tenant',
      target_id: tenantId,
      details: { plan_type: planType, reference, provider: 'stripe' },
    })

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(msg, { status: 500 })
  }
})

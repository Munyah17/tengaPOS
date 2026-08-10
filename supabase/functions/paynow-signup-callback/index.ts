// Paynow result URL for subscription checkouts.
// Paynow POSTs urlencoded status updates here; we verify the SHA-512 hash
// with the platform integration key, then activate the tenant's plan.
// Deploy with --no-verify-jwt (Paynow cannot send a Supabase JWT).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAN_MONTHS: Record<string, number> = {
  byod_monthly: 1,
  standard_plan: 6,
  pro_package: 6,
}

async function sha512(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

serve(async (req) => {
  try {
    const integKey = Deno.env.get('PLATFORM_PAYNOW_KEY')
    if (!integKey) return new Response('Not configured', { status: 503 })

    const bodyText = await req.text()
    const fields = new URLSearchParams(bodyText)

    const reference = fields.get('reference') || ''
    const paynowRef = fields.get('paynowreference') || ''
    const amount = fields.get('amount') || '0'
    const status = fields.get('status') || ''
    const receivedHash = fields.get('hash') || ''

    // Verify hash: concatenate all fields except hash, in received order, + key
    let concat = ''
    for (const [k, v] of fields.entries()) {
      if (k.toLowerCase() !== 'hash') concat += v
    }
    const computed = await sha512(concat + integKey)
    if (computed !== receivedHash.toUpperCase()) {
      return new Response('Invalid hash', { status: 400 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Platform invoices never create a signup_checkouts row -- their
    // reference carries a distinct PINV- prefix (see signup-checkout's
    // platform_invoice branch) so they're handled entirely separately here.
    if (reference.startsWith('PINV-')) {
      const paidNow = status.toLowerCase() === 'paid' || status.toLowerCase() === 'awaiting delivery'
      if (!paidNow) return new Response('OK', { status: 200 })

      // Idempotency: same guard as stripe-webhook -- only proceed if this
      // UPDATE actually flips a payable invoice, so a retried Paynow
      // callback can't double-insert the ledger row.
      const { data: updated } = await admin
        .from('platform_invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('reference', reference)
        .in('status', ['sent', 'overdue'])
        .select('id, tenant_id, amount, currency')
        .maybeSingle()

      if (updated) {
        await admin.from('subscription_payments').insert({
          tenant_id: updated.tenant_id,
          platform_invoice_id: updated.id,
          provider: 'paynow',
          provider_ref: paynowRef,
          plan_type: 'platform_invoice',
          amount: Number(amount) || updated.amount,
          currency: updated.currency,
        })
        await admin.from('audit_logs').insert({
          action: 'platform_invoice_paid',
          actor_email: 'paynow-callback',
          target_type: 'platform_invoice',
          target_id: updated.id,
          details: { provider: 'paynow', reference },
        })
      }
      return new Response('OK', { status: 200 })
    }

    const { data: checkout } = await admin
      .from('signup_checkouts')
      .select('id, tenant_id, plan_type, amount, status')
      .eq('reference', reference)
      .maybeSingle()
    if (!checkout) return new Response('Unknown reference', { status: 404 })

    const paid = status.toLowerCase() === 'paid' || status.toLowerCase() === 'awaiting delivery'
    const cancelled = status.toLowerCase() === 'cancelled'

    if (paid && checkout.status !== 'paid') {
      const isFiscal = String(checkout.plan_type).startsWith('fiscal_')
      const isAccountingErp = String(checkout.plan_type).startsWith('erp_')
      const isAiInsights = String(checkout.plan_type).startsWith('ai_')
      const isWhatsappReceipts = String(checkout.plan_type).startsWith('wa_')
      const FISCAL_MONTHS: Record<string, number> = {
        fiscal_monthly: 1, fiscal_quarterly: 3, fiscal_halfyear: 6, fiscal_yearly: 12,
      }
      const ERP_MONTHS: Record<string, number> = {
        erp_monthly: 1, erp_quarterly: 3, erp_halfyear: 6, erp_yearly: 12,
      }
      const AI_MONTHS: Record<string, number> = {
        ai_monthly: 1, ai_quarterly: 3, ai_halfyear: 6, ai_yearly: 12,
      }
      const WHATSAPP_MONTHS: Record<string, number> = {
        wa_monthly: 1, wa_yearly: 12,
      }
      const months = isFiscal
        ? (FISCAL_MONTHS[checkout.plan_type] || 1)
        : isAccountingErp
        ? (ERP_MONTHS[checkout.plan_type] || 1)
        : isAiInsights
        ? (AI_MONTHS[checkout.plan_type] || 1)
        : isWhatsappReceipts
        ? (WHATSAPP_MONTHS[checkout.plan_type] || 1)
        : (PLAN_MONTHS[checkout.plan_type] || 6)
      const now = new Date()
      const renewal = new Date(now)
      renewal.setMonth(renewal.getMonth() + months)

      if (isFiscal) {
        // Unlock the ZIMRA Fiscalisation add-on for the paid period
        const { data: t } = await admin.from('tenants').select('features').eq('id', checkout.tenant_id).maybeSingle()
        await admin.from('tenants').update({
          features: { ...(t?.features || {}), fiscalisation: true },
          fiscal_expires_at: renewal.toISOString(),
        }).eq('id', checkout.tenant_id)
      } else if (isAccountingErp) {
        // Unlock the Accounting & ERP bundle for the paid period. Monthly
        // subscribers are pinned to the 1st of the next calendar month
        // (rather than "now + 1 month" rolling) so the 5-day-after-expiry
        // auto-lock (lock_expired_accounting_erp, hourly pg_cron) lines up
        // with "locked 5 days into an unpaid calendar month." Quarterly/
        // halfyear/yearly keep the rolling-N-months expiry.
        const erpExpiry = checkout.plan_type === 'erp_monthly'
          ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
          : renewal
        const { data: t } = await admin.from('tenants').select('features').eq('id', checkout.tenant_id).maybeSingle()
        await admin.from('tenants').update({
          features: { ...(t?.features || {}), accounting_erp: true },
          accounting_erp_expires_at: erpExpiry.toISOString(),
        }).eq('id', checkout.tenant_id)
      } else if (isAiInsights) {
        // Unlock AI Insights for the paid period
        const { data: t } = await admin.from('tenants').select('features').eq('id', checkout.tenant_id).maybeSingle()
        await admin.from('tenants').update({
          features: { ...(t?.features || {}), ai_insights: true },
          ai_insights_expires_at: renewal.toISOString(),
        }).eq('id', checkout.tenant_id)
      } else if (isWhatsappReceipts) {
        // Unlock WhatsApp Receipts for the paid period
        const { data: t } = await admin.from('tenants').select('features').eq('id', checkout.tenant_id).maybeSingle()
        await admin.from('tenants').update({
          features: { ...(t?.features || {}), whatsapp_receipts: true },
          whatsapp_receipts_expires_at: renewal.toISOString(),
        }).eq('id', checkout.tenant_id)
      } else {
        await admin.from('tenants').update({
          status: 'active',
          plan_type: checkout.plan_type,
          plan_start_date: now.toISOString(),
          next_renewal_date: renewal.toISOString(),
          approved_at: now.toISOString(),
        }).eq('id', checkout.tenant_id)
      }

      await admin.from('signup_checkouts')
        .update({ status: 'paid', updated_at: now.toISOString() })
        .eq('id', checkout.id)

      await admin.from('subscription_payments').insert({
        tenant_id: checkout.tenant_id,
        checkout_id: checkout.id,
        provider: 'paynow',
        provider_ref: paynowRef,
        plan_type: checkout.plan_type,
        amount: Number(amount) || checkout.amount,
        currency: 'USD',
      })

      await admin.from('audit_logs').insert({
        action: 'subscription_paid',
        actor_email: 'paynow-callback',
        target_type: 'tenant',
        target_id: checkout.tenant_id,
        details: { plan_type: checkout.plan_type, reference, provider: 'paynow' },
      })
    } else if (cancelled) {
      await admin.from('signup_checkouts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', checkout.id)
    }

    return new Response('OK', { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(msg, { status: 500 })
  }
})

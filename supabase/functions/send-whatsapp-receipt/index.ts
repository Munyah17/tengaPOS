// Pushes a PDF receipt to a customer's WhatsApp via the WhatsApp Business
// Cloud API (Meta). Paid add-on ($5/month, $50/year) -- gated on
// tenants.features.whatsapp_receipts, same shape as every other paid
// add-on in this app (accounting_erp, ai_insights, fiscalisation).
//
// The PDF is generated client-side (see src/utils/receiptPdf.js) and
// already uploaded to the private 'receipts' storage bucket by the caller
// before this runs -- this function only mints a short-lived signed URL
// for WhatsApp to fetch once, so the bucket itself never needs to be
// public. WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are Meta
// Business credentials the tenant sets up themselves; until they're
// configured this returns a clear "not connected yet" error rather than
// failing obscurely, same pattern as Stripe/Paynow elsewhere in this app.
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

// WhatsApp Cloud API wants E.164 digits, no leading '+'. Doesn't attempt to
// guess a missing country code -- the phone field's own placeholder/label
// in the UI is where that guidance belongs, not a silent guess here that
// could send someone else's number a stranger's receipt.
function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  return digits.length >= 9 ? digits : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    const { tenant_id, phone, storage_path, filename, receipt_number } = await req.json()
    if (!tenant_id || !phone || !storage_path) {
      return json({ error: 'tenant_id, phone, and storage_path are required' }, 400)
    }

    // Caller must actually belong to this tenant -- never trust a
    // client-supplied tenant_id alone (a cashier's own JWT proves who
    // they are, not which tenant they're allowed to send receipts for).
    const { data: callerRow } = await admin.from('users').select('tenant_id').eq('id', caller.id).maybeSingle()
    if (!callerRow || callerRow.tenant_id !== tenant_id) return json({ error: 'Not authorized for this tenant' }, 403)

    const { data: tenant } = await admin.from('tenants').select('features, whatsapp_receipts_expires_at').eq('id', tenant_id).maybeSingle()
    const active = tenant?.features?.whatsapp_receipts === true
      && (!tenant?.whatsapp_receipts_expires_at || new Date(tenant.whatsapp_receipts_expires_at) > new Date())
    if (!active) {
      return json({ error: 'WhatsApp Receipts isn\'t active for this business — subscribe in Settings to turn it on.' }, 403)
    }

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    if (!accessToken || !phoneNumberId) {
      return json({ error: 'WhatsApp isn\'t connected yet. Contact tengaPOS support to finish setup.' }, 503)
    }

    const to = normalizePhone(phone)
    if (!to) return json({ error: 'That phone number doesn\'t look valid' }, 400)

    // 10 minutes is generous for WhatsApp to fetch it once; the bucket
    // itself stays private the whole time either way.
    const { data: signed, error: signErr } = await admin.storage.from('receipts').createSignedUrl(storage_path, 600)
    if (signErr || !signed?.signedUrl) return json({ error: signErr?.message || 'Could not prepare the receipt file' }, 500)

    const waRes = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link: signed.signedUrl, filename: filename || `Receipt-${receipt_number || 'tengaPOS'}.pdf` },
      }),
    })
    const waJson = await waRes.json()
    if (!waRes.ok) {
      // The most common real failure here: WhatsApp only allows a free-form
      // business-initiated message like this within 24h of the customer's
      // last message to this number -- outside that window it needs a
      // pre-approved message template instead, which this endpoint doesn't
      // attempt (no template exists yet). Surface Meta's own message
      // rather than a generic one so that's diagnosable from the toast.
      return json({ error: waJson?.error?.message || 'WhatsApp declined to send this message' }, 502)
    }

    return json({ sent: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

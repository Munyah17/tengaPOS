// Paynow payment session initiator
// Creates a checkout session with Paynow and returns the hosted checkout URL.
// Client NEVER sees the integration key — only this function reads it via service role.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { tenant_id, amount, items, return_url } = await req.json()

    if (!tenant_id || !amount || !Array.isArray(items) || items.length === 0) {
      return json({ error: 'Missing required fields: tenant_id, amount, items' }, 400)
    }

    // Fetch the vendor's Paynow credentials from tenants table (server-side only)
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('paynow_integration_id, paynow_integration_key, name')
      .eq('id', tenant_id)
      .single()

    if (tenantErr || !tenant?.paynow_integration_id || !tenant?.paynow_integration_key) {
      return json({
        error: 'Paynow not configured. Go to Settings → Payments to add your Paynow Integration ID and Key.',
      }, 400)
    }

    // Build Paynow request fields
    const reference    = `TPOS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const amountStr    = Number(amount).toFixed(2)
    const additionalInfo = items.slice(0, 5).map((i: { name: string; qty: number }) => `${i.name}×${i.qty}`).join(', ')
    const resultUrl    = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paynow-callback`
    const returnUrl    = return_url || 'https://www.tengapos.co.zw/app/payment/return'
    const statusField  = 'Message'
    const integId      = tenant.paynow_integration_id
    const integKey     = tenant.paynow_integration_key

    // SHA-512 hash per Paynow spec:
    // id + reference + amount + additionalinfo + returnurl + resulturl + status + integrationkey
    const hash = await sha512(
      integId + reference + amountStr + additionalInfo + returnUrl + resultUrl + statusField + integKey,
    )

    const formData = {
      id:             integId,
      reference,
      amount:         amountStr,
      additionalinfo: additionalInfo,
      returnurl:      returnUrl,
      resulturl:      resultUrl,
      status:         statusField,
      hash,
    }

    // Paynow resets connections from Supabase's Edge/Deno Deploy IP range
    // (confirmed directly) -- relayed through a Vercel serverless function
    // on a different network instead. See api/paynow-proxy.js.
    const proxyUrl = Deno.env.get('PAYNOW_PROXY_URL')
    const proxySecret = Deno.env.get('PAYNOW_PROXY_SECRET')
    if (!proxyUrl || !proxySecret) {
      return json({ error: 'Paynow proxy is not configured yet — contact support.' }, 503)
    }
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-proxy-secret': proxySecret },
      body: JSON.stringify({ targetUrl: 'https://www.paynow.co.zw/interface/initiatetransaction', formData }),
    })
    const proxyJson = await proxyRes.json()
    if (!proxyRes.ok) return json({ error: `Paynow proxy: ${proxyJson?.error || 'request failed'}` }, 502)
    const responseText = proxyJson.body || ''
    const params       = new URLSearchParams(responseText)

    if (params.get('status')?.toLowerCase() !== 'ok') {
      return json({ error: `Paynow: ${params.get('error') || responseText}` }, 400)
    }

    const browserUrl = params.get('browserurl') || ''
    const pollUrl    = params.get('pollurl') || ''

    // Persist the session so callback and return page can update/read it
    const { data: session } = await supabase
      .from('payment_sessions')
      .insert({
        tenant_id,
        reference,
        amount:     Number(amountStr),
        browser_url: browserUrl,
        poll_url:   pollUrl,
        status:     'pending',
        order_data: { items, total: Number(amountStr) },
      })
      .select('id')
      .single()

    return json({ reference, browserUrl, pollUrl, sessionId: session?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

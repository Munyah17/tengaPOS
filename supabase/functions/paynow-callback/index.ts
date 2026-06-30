// Paynow result URL callback (server-to-server)
// Paynow POSTs here after every status change. We verify the hash,
// then update our payment_sessions record. No money ever touches this function.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sha512(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

// Paynow status → our internal status
const STATUS_MAP: Record<string, string> = {
  'paid':               'paid',
  'awaiting delivery':  'awaiting_delivery',
  'delivered':          'paid',
  'created':            'pending',
  'sent':               'pending',
  'cancelled':          'cancelled',
  'disputed':           'failed',
  'refunded':           'failed',
}

serve(async (req) => {
  // Paynow sends POST with application/x-www-form-urlencoded
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body   = await req.text()
    const p      = new URLSearchParams(body)

    const reference    = p.get('reference')    || ''
    const paynowRef    = p.get('paynowreference') || ''
    const amount       = p.get('amount')       || ''
    const status       = p.get('status')       || ''
    const pollUrl      = p.get('pollurl')      || ''
    const receivedHash = p.get('hash')         || ''

    if (!reference) return new Response('Missing reference', { status: 400 })

    // Load session + tenant integration key (need key to verify hash)
    const { data: session, error } = await supabase
      .from('payment_sessions')
      .select('id, tenant_id, tenants(paynow_integration_key)')
      .eq('reference', reference)
      .single()

    if (error || !session) return new Response('Session not found', { status: 404 })

    // deno-lint-ignore no-explicit-any
    const integKey = (session.tenants as any)?.paynow_integration_key
    if (!integKey) return new Response('Integration key missing', { status: 400 })

    // Verify Paynow hash: reference+amount+paynowreference+pollurl+status+integrationkey
    const expected = await sha512(reference + amount + paynowRef + pollUrl + status + integKey)
    if (receivedHash.toUpperCase() !== expected) {
      return new Response('Hash verification failed', { status: 400 })
    }

    const ourStatus = STATUS_MAP[status.toLowerCase()] ?? 'pending'

    await supabase
      .from('payment_sessions')
      .update({
        status:            ourStatus,
        paynow_reference:  paynowRef,
        poll_url:          pollUrl,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', session.id)

    // Paynow expects a 200 OK text response
    return new Response('OK', { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(msg, { status: 500 })
  }
})

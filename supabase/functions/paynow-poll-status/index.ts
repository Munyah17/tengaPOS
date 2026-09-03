// Active fallback for the Paynow payment-confirmation loop.
//
// paynow-callback is Paynow's server-to-server webhook -- it's what
// normally marks a payment_sessions row paid/failed/etc. But a webhook
// delivery is inherently best-effort: if it's ever dropped (a one-off
// network blip between Paynow and Supabase, Paynow exhausting its own
// retry budget), the session sits on "pending" forever with nothing to
// reconcile it, even though the customer's money already moved. This
// showed up live as "payment goes through but the app never confirms it".
//
// Paynow already gives us a way to ask directly instead of waiting: the
// pollUrl saved on the session at initiate time answers the exact same
// question the webhook would have. PaymentReturn.jsx calls this function
// once, as a fallback, if its normal passive DB-polling loop times out
// still on "pending" -- so a dropped webhook doesn't leave the customer
// staring at "Payment Not Confirmed" when Paynow itself already knows
// the real outcome.
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

// Kept in sync with paynow-callback's STATUS_MAP by hand -- this
// project's edge functions are deliberately self-contained (no shared
// module), matching the existing sha512 duplication between the two.
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { reference } = await req.json()
    if (!reference) return json({ error: 'Missing reference' }, 400)

    const { data: sessionRow, error: sessionErr } = await supabase
      .from('payment_sessions')
      .select('id, status, poll_url, tenants(paynow_integration_key)')
      .eq('reference', reference)
      .single()
    if (sessionErr || !sessionRow) return json({ error: 'Session not found' }, 404)

    // Already resolved -- by the webhook, or a previous call to this same
    // function. Nothing to reconcile; just report what we already have.
    if (sessionRow.status !== 'pending') return json({ status: sessionRow.status })
    if (!sessionRow.poll_url) return json({ status: 'pending' })

    // deno-lint-ignore no-explicit-any
    const integKey = (sessionRow.tenants as any)?.paynow_integration_key
    if (!integKey) return json({ status: 'pending' })

    let pollRes: Response
    try {
      pollRes = await fetch(sessionRow.poll_url, { method: 'POST' })
    } catch (fetchErr) {
      // A network hiccup reaching Paynow right now isn't a hard failure --
      // stay pending, PaymentReturn.jsx's UI already explains money will
      // still reflect once Paynow confirms.
      console.error('paynow-poll-status: poll fetch failed', fetchErr)
      return json({ status: 'pending' })
    }
    const text = await pollRes.text()
    const p = new URLSearchParams(text)
    const status = p.get('status') || ''

    // Paynow's poll endpoint is expected to answer in the same
    // key=value format as its webhook. If it ever doesn't (an outage
    // page, a format change on their end), log the raw body for
    // debugging but never forward it -- the caller only ever sees a
    // clean status, never unparsed third-party text.
    if (!status) {
      console.error('paynow-poll-status: unrecognised poll response:', text.slice(0, 500))
      return json({ status: 'pending' })
    }

    const amount = p.get('amount') || ''
    const paynowRef = p.get('paynowreference') || ''
    const receivedHash = p.get('hash') || ''
    const expected = await sha512(reference + amount + paynowRef + sessionRow.poll_url + status + integKey)
    if (receivedHash.toUpperCase() !== expected) {
      console.error('paynow-poll-status: hash verification failed')
      return json({ status: 'pending' })
    }

    const ourStatus = STATUS_MAP[status.toLowerCase()] ?? 'pending'
    await supabase
      .from('payment_sessions')
      .update({ status: ourStatus, paynow_reference: paynowRef, updated_at: new Date().toISOString() })
      .eq('id', sessionRow.id)

    return json({ status: ourStatus })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('paynow-poll-status error:', msg)
    return json({ error: 'Could not check payment status right now' }, 500)
  }
})

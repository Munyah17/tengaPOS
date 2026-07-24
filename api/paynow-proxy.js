// Relays Paynow's initiatetransaction call through Vercel's network instead
// of Supabase Edge Functions' -- Paynow (or something in front of it)
// resets connections from Supabase's shared Edge/Deno Deploy IP ranges
// ("Connection reset by peer" on every attempt, confirmed directly: the
// same request succeeds immediately from a normal network). All the
// actual business logic -- hash computation, pricing, tenant auth -- stays
// in the Supabase edge functions; this is a dumb, single-purpose relay.
//
// Guarded by a shared secret (PAYNOW_PROXY_SECRET, set the same in both
// Vercel and Supabase) so this endpoint can't be used as an open relay to
// spam Paynow from anywhere on the internet.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = process.env.PAYNOW_PROXY_SECRET
  if (!secret || req.headers['x-proxy-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const { targetUrl, formData } = req.body || {}
    const allowedTargets = [
      'https://www.paynow.co.zw/interface/initiatetransaction',
      'https://www.paynow.co.zw/interface/remotetransaction',
    ]
    if (!allowedTargets.includes(targetUrl)) {
      res.status(400).json({ error: 'Invalid target' })
      return
    }

    const body = new URLSearchParams(formData || {})
    const paynowRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await paynowRes.text()
    res.status(200).json({ status: paynowRes.status, body: text })
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Proxy request failed' })
  }
}

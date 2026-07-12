import { supabase } from '@/lib/supabase'

/**
 * Initiates a Paynow hosted checkout session.
 * The integration key never leaves the server (edge function reads it from DB).
 *
 * @returns {{ reference, browserUrl, sessionId }}
 */
export async function initiatePaynowCheckout({ tenantId, amount, items }) {
  const returnUrl = `${window.location.origin}/app/payment/return`

  const { data, error } = await supabase.functions.invoke('paynow-initiate', {
    body: {
      tenant_id:  tenantId,
      amount:     Number(amount).toFixed(2),
      items:      items.map((i) => ({ name: i.name, qty: i.quantity || i.qty || 1, price: i.price })),
      return_url: returnUrl,
    },
  })

  if (error) {
    // supabase-js hides the real error body behind "non-2xx status code" — unwrap it
    let msg = error.message || 'Edge function error'
    try {
      const ctx = await error.context?.json()
      if (ctx?.error) msg = ctx.error
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  if (!data?.browserUrl) throw new Error('No checkout URL returned from Paynow')

  return data
}

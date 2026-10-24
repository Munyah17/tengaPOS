import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc, refreshSessionOnce } = vi.hoisted(() => ({ rpc: vi.fn(), refreshSessionOnce: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('@/lib/authRetry', () => ({ isStaleJwtError: (message) => message === 'stale', refreshSessionOnce }))
import { saveCheckout } from './db'

const sale = {
  tenantId: 'tenant', cartItems: [{ id: 'custom', name: 'Membership', quantity: 1, price: 20 }],
  total: 20, subtotal: 20, tax: 0, receiptNo: 'receipt', clientRef: 'stable-id',
}
beforeEach(() => {
  vi.resetAllMocks()
  rpc.mockResolvedValue({ data: { order_id: 'order', receipt_no: 'receipt' }, error: null })
})
describe('checkout customer persistence', () => {
  it('keeps existing checkout requests unchanged for sales without customer details', async () => {
    await saveCheckout(sale)
    expect(rpc).toHaveBeenCalledWith('process_checkout', expect.not.objectContaining({ p_customer_details: expect.anything() }))
  })
  it('sends customer snapshots through the atomic account-specific RPC', async () => {
    const customerDetails = { name: 'Member', phone: '0780000000' }
    const result = await saveCheckout({ ...sale, customerDetails })
    expect(rpc).toHaveBeenCalledWith('process_checkout_with_customer', expect.objectContaining({
      p_tenant_id: 'tenant', p_client_ref: 'stable-id', p_customer_details: customerDetails,
    }))
    expect(result).toEqual({ order: { id: 'order' }, receiptNo: 'receipt' })
  })
  it('preserves customer details and sale identity through authentication retries', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'stale' } })
    refreshSessionOnce.mockResolvedValue(true)
    await saveCheckout({ ...sale, customerDetails: { email: 'member@example.com' } })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0])
  })
})

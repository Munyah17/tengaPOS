import { describe, it, expect } from 'vitest'
import { canCaptureReceiptCustomer, normalizeReceiptCustomer, receiptCustomerLines } from './receiptCustomer'

describe('Siyaya receipt customer details', () => {
  it('enables only the exact tenant slug, independently of name, plan or email', () => {
    expect(canCaptureReceiptCustomer({ slug: 'siyaya-fit-271e5024' })).toBe(true)
    for (const tenant of [null, {}, { slug: 'other' }, { name: 'Siyaya FitActive' }, { slug: 'siyaya-fit-271e5024-other' }]) {
      expect(canCaptureReceiptCustomer(tenant)).toBe(false)
    }
  })
  it('keeps blank walk-in receipts free of customer rows', () => {
    expect(normalizeReceiptCustomer({ name: ' ', phone: '', email: '\t' })).toBeNull()
    expect(receiptCustomerLines(undefined)).toEqual([])
  })
  it('normalizes optional contact-only details and discards unexpected fields', () => {
    expect(normalizeReceiptCustomer({ phone: ' 0780000000 ', email: ' member@example.com ', ignored: 'x' }))
      .toEqual({ phone: '0780000000', email: 'member@example.com' })
  })
  it('preserves customer names and phone leading zeroes across receipt formats', () => {
    expect(receiptCustomerLines({ name: ' Jane & John ', phone: '0780000000' }))
      .toEqual([['Customer', 'Jane & John'], ['Phone', '0780000000']])
  })
  it('strips printer control characters from customer input', () => {
    expect(normalizeReceiptCustomer({ name: 'Jane\x1b@\nMember' })).toEqual({ name: 'Jane@Member' })
  })
  it('bounds printed values and ignores non-text inputs', () => {
    expect(normalizeReceiptCustomer({ name: 'x'.repeat(121), phone: 123, email: null }))
      .toEqual({ name: 'x'.repeat(120) })
  })
})

import { describe, it, expect } from 'vitest'
import { generateReceiptPdfBlob } from './receiptPdf'
const receipt = { receiptNumber: 'R1', items: [], subtotal: 10, tax: 0, total: 10, paymentMethod: 'cash', cashier: 'Cashier', vatEnabled: false }
const meta = { storeName: 'Store', dateStr: '24 Oct 2026', timeStr: '12:00' }
describe('customer receipt PDF', () => {
  it('includes captured customer details on downloaded and shared receipts', async () => {
    const blob = generateReceiptPdfBlob({ ...receipt, customerDetails: { name: 'Jane Member', phone: '0780000000', email: 'member@example.com' } }, meta)
    const pdf = await blob.text()
    expect(pdf).toContain('Customer: Jane Member')
    expect(pdf).toContain('Phone: 0780000000')
    expect(pdf).toContain('Email: member@example.com')
  })
  it('keeps existing walk-in PDFs free of customer headings', async () => {
    expect(await generateReceiptPdfBlob(receipt, meta).text()).not.toContain('Customer:')
  })
})

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from './formatters'

/**
 * Generates and downloads a PDF for a quotation or invoice. `doc` is a row
 * from the `documents` table (or the in-memory equivalent before saving).
 * `store` is { name, address, contacts, tin, vatNumber } — pulled from
 * Receipts Config the same way receipts are, so branding stays consistent
 * across receipts, quotations, and invoices.
 */
export function generateDocumentPDF(doc, store, currency = 'USD') {
  const pdf = new jsPDF()
  const isInvoice = doc.doc_type === 'invoice'
  const fmt = (n) => formatCurrency(n, currency)

  pdf.setFontSize(18)
  pdf.setFont(undefined, 'bold')
  pdf.text(store.name || 'Your Business', 14, 20)
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9)
  let y = 27
  if (store.address) { pdf.text(store.address, 14, y); y += 5 }
  if (store.contacts) { pdf.text(store.contacts, 14, y); y += 5 }
  if (store.tin) { pdf.text(`TIN: ${store.tin}`, 14, y); y += 5 }
  if (store.vatNumber) { pdf.text(`VAT Reg: ${store.vatNumber}`, 14, y); y += 5 }

  pdf.setFontSize(16)
  pdf.setFont(undefined, 'bold')
  pdf.text(isInvoice ? 'TAX INVOICE' : 'QUOTATION', 196, 20, { align: 'right' })
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(10)
  pdf.text(`No: ${doc.doc_number}`, 196, 27, { align: 'right' })
  pdf.text(`Date: ${formatDate(doc.created_at || new Date())}`, 196, 32, { align: 'right' })
  if (!isInvoice && doc.valid_until) pdf.text(`Valid until: ${formatDate(doc.valid_until)}`, 196, 37, { align: 'right' })
  if (isInvoice && doc.due_date) pdf.text(`Due: ${formatDate(doc.due_date)}`, 196, 37, { align: 'right' })

  y = Math.max(y, 40) + 5
  pdf.setFontSize(9)
  pdf.setFont(undefined, 'bold')
  pdf.text('Bill To', 14, y)
  pdf.setFont(undefined, 'normal')
  y += 5
  pdf.text(doc.customer_name || '—', 14, y)
  if (doc.customer_email) { y += 5; pdf.text(doc.customer_email, 14, y) }
  if (doc.customer_phone) { y += 5; pdf.text(doc.customer_phone, 14, y) }
  if (doc.customer_address) { y += 5; pdf.text(doc.customer_address, 14, y) }

  const items = doc.items || []
  autoTable(pdf, {
    startY: y + 8,
    head: [['Description', 'Qty', 'Unit Price', 'Discount', 'Total']],
    body: items.map((i) => {
      const lineTotal = i.qty * i.unit_price * (1 - (i.discount_pct || 0) / 100)
      return [i.description, i.qty, fmt(i.unit_price), i.discount_pct ? `${i.discount_pct}%` : '—', fmt(lineTotal)]
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175] },
  })

  let finalY = pdf.lastAutoTable.finalY + 8
  const totalsX = 196
  pdf.setFontSize(9)
  pdf.text('Subtotal (ex VAT):', 140, finalY)
  pdf.text(fmt(doc.subtotal), totalsX, finalY, { align: 'right' })
  if (doc.vat_amount > 0) {
    finalY += 6
    pdf.text('VAT:', 140, finalY)
    pdf.text(fmt(doc.vat_amount), totalsX, finalY, { align: 'right' })
  }
  finalY += 7
  pdf.setFont(undefined, 'bold')
  pdf.setFontSize(11)
  pdf.text('Total:', 140, finalY)
  pdf.text(fmt(doc.total), totalsX, finalY, { align: 'right' })
  pdf.setFont(undefined, 'normal')

  if (doc.notes) {
    finalY += 12
    pdf.setFontSize(9)
    pdf.setFont(undefined, 'bold')
    pdf.text('Notes', 14, finalY)
    pdf.setFont(undefined, 'normal')
    finalY += 5
    pdf.text(pdf.splitTextToSize(doc.notes, 180), 14, finalY)
  }

  pdf.save(`${doc.doc_number}.pdf`)
}

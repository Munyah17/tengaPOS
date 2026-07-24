import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from './formatters'
import { hexToRgb } from './exportUtils'

// jsPDF needs actual image bytes (data URL), not a bare remote URL --
// fetches the logo and converts it once per PDF generation. Never throws:
// a broken/unreachable logo just means the PDF prints without one.
async function fetchLogoDataUrl(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Generates and downloads a PDF for a quotation or invoice. `doc` is a row
 * from the `documents` table (or the in-memory equivalent before saving).
 * `store` is { name, address, contacts, tin, vatNumber, logoUrl, bankDetails }
 * — pulled from Receipts Config the same way receipts are, so branding stays
 * consistent across receipts, quotations, and invoices. `brandColor` (hex)
 * comes from the tenant's white-label config, if they have one — falls back
 * to tengaPOS blue.
 */
export async function generateDocumentPDF(doc, store, currency = 'USD', brandColor = null) {
  const pdf = new jsPDF()
  const isInvoice = doc.doc_type === 'invoice'
  const fmt = (n) => formatCurrency(n, currency)
  const [r, g, b] = hexToRgb(brandColor)

  const logoDataUrl = await fetchLogoDataUrl(store.logoUrl)
  const textX = logoDataUrl ? 40 : 14
  if (logoDataUrl) {
    try { pdf.addImage(logoDataUrl, 'PNG', 14, 14, 20, 20) } catch { /* unsupported format — skip, text still prints */ }
  }

  pdf.setFontSize(18)
  pdf.setFont(undefined, 'bold')
  pdf.setTextColor(r, g, b)
  pdf.text(store.name || 'Your Business', textX, 20)
  pdf.setTextColor(0, 0, 0)
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9)
  let y = 27
  if (store.address) { pdf.text(store.address, textX, y); y += 5 }
  if (store.contacts) { pdf.text(store.contacts, textX, y); y += 5 }
  if (store.tin) { pdf.text(`TIN: ${store.tin}`, textX, y); y += 5 }
  if (store.vatNumber) { pdf.text(`VAT Reg: ${store.vatNumber}`, textX, y); y += 5 }
  y = Math.max(y, logoDataUrl ? 36 : y)

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
    headStyles: { fillColor: [r, g, b] },
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
    const notesLines = pdf.splitTextToSize(doc.notes, 180)
    pdf.text(notesLines, 14, finalY)
    finalY += notesLines.length * 5
  }

  if (store.bankDetails) {
    finalY += 12
    pdf.setFontSize(9)
    pdf.setFont(undefined, 'bold')
    pdf.text('Banking Details', 14, finalY)
    pdf.setFont(undefined, 'normal')
    finalY += 5
    pdf.text(pdf.splitTextToSize(store.bankDetails, 180), 14, finalY)
  }

  pdf.save(`${doc.doc_number}.pdf`)
}

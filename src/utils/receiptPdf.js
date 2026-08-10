import jsPDF from 'jspdf'

const WIDTH_MM = 80
const MARGIN = 4
const LINE_H = 4.6

// A PDF version of the same receipt ZimraReceipt.jsx already prints/shows
// on screen -- same content, same order, sized like an actual 80mm thermal
// receipt (not A4) so it reads naturally on a phone via WhatsApp instead
// of looking like a stray business document. meta carries exactly what
// ZimraReceipt.jsx has already computed for its own render (store header,
// formatted date/time, footer lines) so this stays a pure function with no
// store access of its own -- same style as the rest of utils/.
export function generateReceiptPdfBlob(receipt, meta) {
  const {
    storeName, storeAddress, storeContacts, tin, vatNo, logoUrl,
    dateStr, timeStr, showFiscalSection, deviceID, receiptGlobalNo,
    shopFooterLines, systemFooterLines, headerMessage, customLines,
  } = meta
  const vatEnabled = receipt.vatEnabled !== false
  const vatRate = receipt.vatRate ?? 15.5
  const fmt = (n) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: receipt.currency || 'USD' }).format(n)
    } catch {
      return `$${Number(n || 0).toFixed(2)}`
    }
  }

  // Height is estimated generously up front (one long page, no page
  // breaks) -- simpler and always correct for a receipt-length document,
  // unlike trying to paginate a continuous thermal-style layout.
  const estimatedLines = 40 + receipt.items.length * 3 + (customLines?.length || 0) + (headerMessage ? 4 : 0)
  const height = Math.max(120, estimatedLines * LINE_H + 20)

  const doc = new jsPDF({ unit: 'mm', format: [WIDTH_MM, height] })
  doc.setFont('courier', 'normal')
  let y = MARGIN

  const center = (text, size = 9, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('courier', bold ? 'bold' : 'normal')
    doc.text(String(text), WIDTH_MM / 2, y, { align: 'center' })
    y += LINE_H
  }
  const row = (left, right, size = 8) => {
    doc.setFontSize(size)
    doc.setFont('courier', 'normal')
    doc.text(String(left), MARGIN, y)
    doc.text(String(right), WIDTH_MM - MARGIN, y, { align: 'right' })
    y += LINE_H
  }
  const dash = () => {
    doc.setLineDashPattern([0.5, 0.5], 0)
    doc.line(MARGIN, y - LINE_H / 2, WIDTH_MM - MARGIN, y - LINE_H / 2)
    y += 1
  }

  if (headerMessage) {
    for (const l of headerMessage.split('\n').filter(Boolean)) center(l, 7)
    dash()
  }

  if (logoUrl) {
    // Best-effort only -- a broken/unreachable logo just means the PDF
    // prints without one, never blocks the send.
    try { doc.addImage(logoUrl, 'PNG', WIDTH_MM / 2 - 10, y, 20, 12); y += 14 } catch { /* skip logo */ }
  }
  center(storeName, 11, true)
  if (storeAddress) center(storeAddress, 8)
  if (storeContacts) center(storeContacts, 8)
  if (tin) center(`TIN: ${tin}`, 8)
  if (vatNo) center(`VAT Reg: ${vatNo}`, 8)
  dash()

  center(showFiscalSection ? 'FISCAL TAX INVOICE' : 'RECEIPT', 9, true)
  row('Receipt No:', receipt.receiptNumber)
  row('Date:', dateStr)
  row('Time:', timeStr)
  row('Cashier:', receipt.cashier)
  if (receipt.salespersonName) {
    row('Salesperson:', receipt.salespersonEmployeeNo ? `${receipt.salespersonName} (${receipt.salespersonEmployeeNo})` : receipt.salespersonName)
  }
  dash()

  center('ITEMS', 8, true)
  for (const item of receipt.items) {
    doc.setFontSize(8)
    doc.setFont('courier', 'bold')
    doc.text(item.name, MARGIN, y)
    y += LINE_H
    doc.setFont('courier', 'normal')
    row(`  ${item.quantity} x ${fmt(item.price)}`, fmt(item.price * item.quantity), 8)
  }
  dash()

  if (receipt.discountAmount > 0) row('Discount', `-${fmt(receipt.discountAmount)}`)
  if (vatEnabled) {
    row('Net (ex VAT)', fmt(receipt.subtotal))
    row(`VAT ${vatRate}% (incl.)`, fmt(receipt.tax))
  }
  row('TOTAL', fmt(receipt.total), 10)
  dash()

  center('PAYMENT', 8, true)
  row(receipt.paymentMethod, fmt(receipt.total))
  if (receipt.amountTendered != null) row('Tendered', fmt(receipt.amountTendered))
  if (receipt.changeDue != null) row('Change', fmt(receipt.changeDue))

  if (showFiscalSection) {
    dash()
    center('ZIMRA FISCAL RECEIPT', 8, true)
    center(`Device ID: ${deviceID}`, 7)
    center(`Receipt Global No: ${receiptGlobalNo}`, 7)
    center('Verify: fdms.zimra.co.zw', 7)
  }

  if (receipt.isReprint) {
    dash()
    center('*** REPRINT / COPY ***', 8, true)
  }

  dash()
  for (const l of shopFooterLines || []) center(l, 7)
  for (const l of customLines || []) center(l.label ? `${l.label}: ${l.value}` : l.value, 7)
  y += 2
  for (const l of systemFooterLines || []) center(l, 6)

  return doc.output('blob')
}

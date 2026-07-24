import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from './formatters'
import { hexToRgb } from './exportUtils'

const MARGIN = 14
const PAGE_W = 210
const FOOTER_H = 22

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

function imageFormat(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl || '')
  const ext = m?.[1]?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG'
  if (ext === 'webp') return 'WEBP'
  return 'PNG'
}

// A light tint of the brand color, for highlight boxes that need to stay
// readable with plain black text (unlike the header/footer, which use the
// full-strength color with white text).
function tint(r, g, b, amount = 0.9) {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]
}

// If every non-empty line looks like "Label: Value", bank details render
// as a clean two-column table instead of a wrapped paragraph -- this is
// exactly how the Settings field's own placeholder already suggests
// filling it in, so no data model change is needed for tenants who typed
// it that way; anything else still falls back to plain text.
function parseBankDetails(text) {
  if (!text) return null
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const rows = lines.map((line) => {
    const idx = line.indexOf(':')
    if (idx === -1) return null
    return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
  })
  return rows.every(Boolean) ? rows : null
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

  // ── Header: logo stays top-left at its own aspect ratio (never
  // stretched into a square), nothing else beside it. Everything about
  // the business — name, address, contacts, TIN, VAT reg — stacks in the
  // right column below the TAX INVOICE/QUOTATION heading. ──
  const logoDataUrl = await fetchLogoDataUrl(store.logoUrl)
  let logoBottom = MARGIN
  if (logoDataUrl) {
    try {
      const props = pdf.getImageProperties(logoDataUrl)
      const maxW = 50, maxH = 32
      const scale = Math.min(maxW / props.width, maxH / props.height)
      const w = props.width * scale, h = props.height * scale
      pdf.addImage(logoDataUrl, imageFormat(logoDataUrl), MARGIN, MARGIN, w, h)
      logoBottom = MARGIN + h
    } catch { /* unsupported format — skip, text still prints */ }
  }

  pdf.setFontSize(18)
  pdf.setFont(undefined, 'bold')
  pdf.setTextColor(r, g, b)
  pdf.text(isInvoice ? 'TAX INVOICE' : 'QUOTATION', 196, 20, { align: 'right' })
  pdf.setTextColor(90, 90, 90)
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9.5)
  let ry = 28
  pdf.text(`No: ${doc.doc_number}`, 196, ry, { align: 'right' })
  ry += 5
  pdf.text(`Date: ${formatDate(doc.created_at || new Date())}`, 196, ry, { align: 'right' })
  ry += 5
  if (!isInvoice && doc.valid_until) { pdf.text(`Valid until: ${formatDate(doc.valid_until)}`, 196, ry, { align: 'right' }); ry += 5 }
  if (isInvoice && doc.due_date) { pdf.text(`Due: ${formatDate(doc.due_date)}`, 196, ry, { align: 'right' }); ry += 5 }

  ry += 4
  pdf.setFontSize(13)
  pdf.setFont(undefined, 'bold')
  pdf.setTextColor(20, 20, 20)
  pdf.text(store.name || 'Your Business', 196, ry, { align: 'right' })
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(90, 90, 90)
  ry += 6
  if (store.address) { pdf.text(store.address, 196, ry, { align: 'right' }); ry += 5 }
  if (store.contacts) { pdf.text(store.contacts, 196, ry, { align: 'right' }); ry += 5 }
  if (store.tin) { pdf.text(`TIN: ${store.tin}`, 196, ry, { align: 'right' }); ry += 5 }
  if (store.vatNumber) { pdf.text(`VAT Reg: ${store.vatNumber}`, 196, ry, { align: 'right' }); ry += 5 }

  let y = Math.max(ry, logoBottom) + 6
  pdf.setDrawColor(r, g, b)
  pdf.setLineWidth(0.6)
  pdf.line(MARGIN, y, 196, y)
  y += 8

  // ── Bill To — a light card, not just bare text, so it reads as a
  // distinct block rather than blending into whatever's above/below it. ──
  pdf.setTextColor(0, 0, 0)
  const billToLines = [doc.customer_name || '—', doc.customer_email, doc.customer_phone, doc.customer_address].filter(Boolean)
  const cardH = 8 + billToLines.length * 5
  pdf.setFillColor(...tint(r, g, b, 0.94))
  pdf.roundedRect(MARGIN, y, 90, cardH, 2, 2, 'F')
  pdf.setFontSize(8.5)
  pdf.setFont(undefined, 'bold')
  pdf.setTextColor(110, 110, 110)
  pdf.text('BILL TO', MARGIN + 4, y + 6)
  pdf.setFont(undefined, 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(20, 20, 20)
  billToLines.forEach((line, i) => {
    pdf.setFont(undefined, i === 0 ? 'bold' : 'normal')
    pdf.text(line, MARGIN + 4, y + 12 + i * 5)
  })
  pdf.setFont(undefined, 'normal')

  y += cardH + 8

  // ── Line items ──
  const items = doc.items || []
  autoTable(pdf, {
    startY: y,
    margin: { bottom: FOOTER_H + 8 },
    head: [['Description', 'Qty', 'Unit Price', 'Discount', 'Total']],
    body: items.map((i) => {
      const lineTotal = i.qty * i.unit_price * (1 - (i.discount_pct || 0) / 100)
      return [i.description, i.qty, fmt(i.unit_price), i.discount_pct ? `${i.discount_pct}%` : '—', fmt(lineTotal)]
    }),
    styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    headStyles: { fillColor: [r, g, b], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 251] },
    columnStyles: {
      1: { halign: 'right', cellWidth: 15 },
      2: { halign: 'right', cellWidth: 27 },
      3: { halign: 'right', cellWidth: 21 },
      4: { halign: 'right', cellWidth: 27 },
    },
  })

  let finalY = pdf.lastAutoTable.finalY + 8
  const totalsX = 196
  pdf.setFontSize(9.5)
  pdf.setTextColor(90, 90, 90)
  pdf.text('Subtotal (ex VAT):', 140, finalY)
  pdf.setTextColor(20, 20, 20)
  pdf.text(fmt(doc.subtotal), totalsX, finalY, { align: 'right' })
  if (doc.vat_amount > 0) {
    finalY += 6
    pdf.setTextColor(90, 90, 90)
    pdf.text('VAT:', 140, finalY)
    pdf.setTextColor(20, 20, 20)
    pdf.text(fmt(doc.vat_amount), totalsX, finalY, { align: 'right' })
  }

  // Highlighted total box — the one number on the page that should be
  // impossible to miss.
  finalY += 6
  pdf.setFillColor(...tint(r, g, b, 0.9))
  pdf.roundedRect(138, finalY - 1, 58, 11, 2, 2, 'F')
  pdf.setFont(undefined, 'bold')
  pdf.setFontSize(11.5)
  pdf.setTextColor(r, g, b)
  pdf.text('TOTAL', 141, finalY + 6.5)
  pdf.text(fmt(doc.total), totalsX, finalY + 6.5, { align: 'right' })
  pdf.setFont(undefined, 'normal')
  pdf.setTextColor(0, 0, 0)
  finalY += 15

  if (doc.notes) {
    pdf.setFontSize(9)
    pdf.setFont(undefined, 'bold')
    pdf.setTextColor(110, 110, 110)
    pdf.text('NOTES', MARGIN, finalY)
    pdf.setFont(undefined, 'normal')
    pdf.setTextColor(20, 20, 20)
    finalY += 5
    const notesLines = pdf.splitTextToSize(doc.notes, 182)
    pdf.text(notesLines, MARGIN, finalY)
    finalY += notesLines.length * 5 + 8
  }

  // ── Bank details — a real two-column table when the field's filled in
  // as "Label: Value" lines (the Settings placeholder already models this),
  // otherwise the previous plain-paragraph rendering. ──
  const bankRows = parseBankDetails(store.bankDetails)
  if (bankRows) {
    autoTable(pdf, {
      startY: finalY,
      margin: { bottom: FOOTER_H + 8, right: PAGE_W - 110 },
      head: [['BANK DETAILS', '']],
      body: bankRows,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [40, 44, 66], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { cellWidth: 64 } },
      theme: 'grid',
    })
    finalY = pdf.lastAutoTable.finalY + 10
  } else if (store.bankDetails) {
    pdf.setFontSize(9)
    pdf.setFont(undefined, 'bold')
    pdf.setTextColor(110, 110, 110)
    pdf.text('BANKING DETAILS', MARGIN, finalY)
    pdf.setFont(undefined, 'normal')
    pdf.setTextColor(20, 20, 20)
    finalY += 5
    const lines = pdf.splitTextToSize(store.bankDetails, 182)
    pdf.text(lines, MARGIN, finalY)
    finalY += lines.length * 5 + 10
  }

  // ── Prepared By / Approved By — a physical sign-off line, common
  // practice for formal quotes/invoices in this market. ──
  if (finalY > 297 - FOOTER_H - 16) { pdf.addPage(); finalY = MARGIN }
  pdf.setDrawColor(210, 210, 210)
  pdf.setLineWidth(0.3)
  pdf.rect(MARGIN, finalY, 182, 10)
  pdf.line(MARGIN + 91, finalY, MARGIN + 91, finalY + 10)
  pdf.setFontSize(8.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text('Prepared By', MARGIN + 3, finalY + 4)
  pdf.text('Approved By', MARGIN + 94, finalY + 4)
  pdf.setFontSize(9)
  pdf.setTextColor(20, 20, 20)
  pdf.text(doc.users?.name || '', MARGIN + 3, finalY + 8.5)

  // ── Footer on every page: company name, address, contacts, page number
  // — signs the document even if it gets separated from an email/cover. ──
  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p)
    pdf.setFillColor(30, 41, 59)
    pdf.rect(0, 297 - FOOTER_H, PAGE_W, FOOTER_H, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont(undefined, 'bold')
    pdf.setFontSize(9)
    pdf.text(store.name || '', PAGE_W / 2, 297 - FOOTER_H + 8, { align: 'center' })
    pdf.setFont(undefined, 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(210, 214, 222)
    const contactLine = [store.address, [store.contacts, store.tin ? `TIN: ${store.tin}` : null].filter(Boolean).join('  ·  ')]
      .filter(Boolean)
    contactLine.forEach((line, i) => pdf.text(line, PAGE_W / 2, 297 - FOOTER_H + 13.5 + i * 4.5, { align: 'center' }))
    pdf.setFontSize(7)
    pdf.setTextColor(150, 155, 168)
    pdf.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, 297 - 3, { align: 'right' })
  }

  pdf.save(`${doc.doc_number}.pdf`)
}

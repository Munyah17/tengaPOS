import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ExportMenu always has a `columns` prop describing exactly which fields
// belong in an export and what to label them -- CSV/Excel/Access used to
// ignore it entirely and dump the raw row objects instead (only the PDF
// export actually used it), so a product-list CSV export came out full of
// internal database columns (id, tenant_id, timestamps, raw JSON columns
// like attributes/price_tiers) that shouldn't be there and, reported live,
// made an exported CSV useless as a re-import template for anyone else.
// columns stays optional so callers that already pre-shape clean plain
// objects themselves (HR.jsx, Reports.jsx) keep working unchanged.
export function shapeRows(data, columns) {
  if (!columns) return data
  return data.map((row) => {
    const shaped = {}
    for (const { header, key } of columns) shaped[header] = row[key] ?? ''
    return shaped
  })
}

// Reports (Sales Report export) previously dumped only the raw transaction
// rows -- reported live: clients wanted the total (and, for a day's cash-up,
// opening/closing balance) baked into the file itself instead of having to
// re-sum the Amount column by hand every time. summaryRows is an optional
// [{ label, value }] list appended as a blank-separated block after the
// data rows -- same file, no second sheet/tab to lose track of.
function appendSummaryRows(ws, summaryRows) {
  if (!summaryRows?.length) return
  XLSX.utils.sheet_add_aoa(ws, [[], ...summaryRows.map((r) => [r.label, r.value])], { origin: -1 })
}

export function exportToCSV(data, filename, columns, summaryRows) {
  const ws = XLSX.utils.json_to_sheet(shapeRows(data, columns))
  appendSummaryRows(ws, summaryRows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `${filename}.csv`)
}

export function exportToExcel(data, filename, columns, summaryRows) {
  const ws = XLSX.utils.json_to_sheet(shapeRows(data, columns))
  appendSummaryRows(ws, summaryRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// White-label brand colour (set by Super Admin per tenant) falls back to
// tengaPOS blue when a tenant has no white-label configured — so every PDF
// export reflects the tenant's own brand once it's set, with no visible
// change for anyone who doesn't have it.
export function hexToRgb(hex, fallback = [30, 64, 175]) {
  if (!hex) return fallback
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!match) return fallback
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

export function exportToPDF(data, columns, title, filename, brandColor, summaryRows) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(title, 14, 22)
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 30)

  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: data.map((row) => columns.map((c) => row[c.key] ?? '')),
    startY: 35,
    styles: { fontSize: 8 },
    headStyles: { fillColor: hexToRgb(brandColor) },
  })

  if (summaryRows?.length) {
    let y = (doc.lastAutoTable?.finalY || 35) + 8
    doc.setFontSize(10)
    for (const r of summaryRows) {
      doc.setFont(undefined, 'bold')
      doc.text(`${r.label}:`, 14, y)
      doc.setFont(undefined, 'normal')
      doc.text(String(r.value), 60, y)
      y += 7
    }
  }

  doc.save(`${filename}.pdf`)
}

export function exportToAccess(data, filename, columns) {
  const ws = XLSX.utils.json_to_sheet(shapeRows(data, columns))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// Excel's "CSV UTF-8" export (the option most people actually pick) writes
// a UTF-8 byte-order-mark (U+FEFF) at the start of the file. Verified live
// against a real exported file: handing the raw bytes to XLSX.read with
// type:'array' + a codepage hint does NOT cleanly strip that BOM -- it
// corrupted the first header ("name" came out as "me", i.e. mis-consumed
// as if the BOM were more than the one character it actually is) rather
// than removing exactly it, so every row still failed the name/price
// check afterwards. Decoding the bytes to text ourselves with TextDecoder
// and stripping a leading U+FEFF BEFORE it ever reaches XLSX (type:
// 'string', not 'array') sidesteps whatever XLSX's own buffer/codepage
// path was doing wrong -- confirmed correct against the same file.
// Header keys are also trimmed/lowercased and string values trimmed on
// the way out, so " Name " or "PRICE" in the spreadsheet still matches
// the lowercase column names (name, price, ...) the rest of the import
// expects.
// The actual parsing logic, split out from the FileReader wrapper below so
// it's directly unit-testable with a plain ArrayBuffer -- no File/
// FileReader DOM API needed.
export function parseCSVBuffer(buffer) {
  let text = new TextDecoder('utf-8').decode(buffer)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const wb = XLSX.read(text, { type: 'string' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  return rows.map((row) => {
    const clean = {}
    for (const key of Object.keys(row)) {
      const cleanKey = key.trim().toLowerCase()
      const value = row[key]
      clean[cleanKey] = typeof value === 'string' ? value.trim() : value
    }
    return clean
  })
}

// Only name is required to import a row. Price and stock are both
// legitimately unknown at import time (a bulk stock-take done before
// pricing is finalized is a real, reported workflow) -- they're preserved
// as NULL ("not entered yet") when blank, via parseOptionalNumber/
// parseOptionalMoney in db.js, distinct from an explicit 0. Never check
// row.price/row.stock here: falsy-style checks (!row.price) would wrongly
// reject a deliberately-entered 0 too.
export function filterValidImportRows(rows) {
  return rows.filter((row) => row.name)
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(parseCSVBuffer(e.target.result))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function generateTemplate() {
  // Mass-inventory upload template. price is VAT-INCLUSIVE.
  // landing_price = what the product cost you (feeds margins & AI insights).
  // vat_treatment: standard | zero_rated | exempt (leave blank for standard).
  // weight/volume/color/size are optional — leave blank if not applicable.
  const template = [
    {
      name: 'Sugar 2kg', sku: 'SUG-2KG', barcode: '6001234567890',
      price: '2.20', landing_price: '1.80', stock: '50',
      low_stock_threshold: '10', brand: 'Gold Star', vat_treatment: 'standard',
      weight: '2kg', volume: '', color: '', size: '',
    },
    {
      name: '', sku: '', barcode: '',
      price: '', landing_price: '', stock: '',
      low_stock_threshold: '', brand: '', vat_treatment: '',
      weight: '', volume: '', color: '', size: '',
    },
  ]
  exportToExcel(template, 'tengaPOS_inventory_template')
}

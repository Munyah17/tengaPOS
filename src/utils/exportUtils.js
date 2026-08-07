import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportToCSV(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `${filename}.csv`)
}

export function exportToExcel(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data)
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

export function exportToPDF(data, columns, title, filename, brandColor) {
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

  doc.save(`${filename}.pdf`)
}

export function exportToAccess(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// Excel's "CSV UTF-8" export (the option most people actually pick) writes
// a UTF-8 byte-order-mark (U+FEFF) at the start of the file. Read as a
// binary string, that BOM lands inside the FIRST header cell's text --
// "name" silently becomes a different, invisible-look-alike string that
// never matches a plain row.name lookup, so every row fails the name/
// price check and the whole file reports "No valid rows found" with no
// indication why. readAsArrayBuffer + XLSX's own codepage-aware parsing
// handles this correctly instead of the legacy readAsBinaryString path.
// Header keys are also trimmed/lowercased and string values trimmed on
// the way out, so " Name " or "PRICE" in the spreadsheet still matches
// the lowercase column names (name, price, ...) the rest of the import
// expects.
const BOM = '\uFEFF'
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', codepage: 65001 })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
        const normalized = rows.map((row) => {
          const clean = {}
          for (const key of Object.keys(row)) {
            const cleanKey = key.replace(BOM, '').trim().toLowerCase()
            const value = row[key]
            clean[cleanKey] = typeof value === 'string' ? value.trim() : value
          }
          return clean
        })
        resolve(normalized)
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

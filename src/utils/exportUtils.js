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

export function exportToPDF(data, columns, title, filename) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(title, 14, 22)
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30)

  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: data.map((row) => columns.map((c) => row[c.key] ?? '')),
    startY: 35,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 64, 175] },
  })

  doc.save(`${filename}.pdf`)
}

export function exportToAccess(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws)
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
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

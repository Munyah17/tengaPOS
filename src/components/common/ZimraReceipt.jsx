import { useRef, useState } from 'react'
import { Printer, X, CheckCircle, Usb } from 'lucide-react'
import { useFiscalStore } from '@/stores/fiscalStore'
import { useReceiptConfigStore } from '@/stores/receiptConfigStore'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/utils/formatters'
import { printToPosPrinter, paperWidthToChars } from '@/lib/posPrinter'
import toast from 'react-hot-toast'

// ZIMRA payment method mapping per FDMS spec v7.2
const ZIMRA_PAYMENT_MAP = {
  cash: 'Cash',
  ecocash: 'MobileWallet',
  innbucks: 'MobileWallet',
  omari: 'MobileWallet',
  onemoney: 'MobileWallet',
  zipit: 'BankTransfer',
  visa: 'Card',
  mastercard: 'Card',
  pos_terminal: 'Card',
}

const PAYMENT_DISPLAY = {
  cash: 'Cash',
  ecocash: 'EcoCash',
  innbucks: 'InnBucks',
  omari: 'Omari',
  onemoney: 'OneMoney',
  zipit: 'ZIPIT',
  visa: 'Visa',
  mastercard: 'Mastercard',
  pos_terminal: 'POS Terminal',
}

export default function ZimraReceipt({ receipt, onClose }) {
  const fdmsQrUrl = receipt.fdmsQrUrl || null
  const receiptRef = useRef(null)
  const [posPrinting, setPosPrinting] = useState(false)
  const fiscal = useFiscalStore()
  const receiptConfig = useReceiptConfigStore()
  const { tenant } = useAuthStore()
  const vatEnabled = receipt.vatEnabled !== false
  const vatRate = receipt.vatRate ?? 15.5
  const fmt = (n) => formatCurrency(n, receipt.currency)

  const isFiscalised = fiscal.isEnabled && fiscal.isRegistered
  // Fully Customized hides the ZIMRA fiscal section even if fiscalisation is
  // technically active — the vendor explicitly opted into their own layout.
  const showFiscalSection = isFiscalised && receiptConfig.templateMode !== 'fully_customized'

  const now = new Date(receipt.date)
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Receipts Config (Settings) is the real, persisted source of store
  // branding — falls back to the ZIMRA fiscal registration's own values
  // (for tenants who set up fiscalisation but never touched Receipts
  // Config), then to the tenant's business name. Never demo placeholders —
  // a line with no real value for this tenant is simply not printed.
  const storeName = receiptConfig.storeName || fiscal.branchName || tenant?.name || 'Receipt'
  const storeAddress = receiptConfig.storeAddress || fiscal.branchAddress || ''
  const storeContacts = receiptConfig.storeContacts || fiscal.branchContacts || ''
  const tin = receiptConfig.tin || fiscal.tin || ''
  // VAT registration only ever appears for tenants who actually run VAT —
  // a tenant that disabled VAT gets no VAT mention anywhere on the receipt.
  const vatNo = vatEnabled ? (receiptConfig.vatNumber || fiscal.vatNumber || '') : ''
  const deviceID = fiscal.deviceID ? fiscal.deviceID.padStart(10, '0') : '0000000000'
  const receiptGlobalNo = String(fiscal.lastReceiptGlobalNo).padStart(10, '0')
  const paperWidthChars = paperWidthToChars(receiptConfig.paperWidthMm || 80)
  const showPosPrintButton = receiptConfig.showPosPrint !== false
  const headerMessage = receiptConfig.headerMessage || ''
  const customLines = Array.isArray(receiptConfig.customLines) ? receiptConfig.customLines.filter((l) => l?.value) : []

  // Footer: the tenant's custom message (if any) replaces only the thank-you
  // line — the "Developed & Powered By" + contact lines are permanent and
  // always print after it. White-label tenants get their own brand's lines
  // there instead (or nothing, if hide_powered_by is set for them).
  const whitelabel = tenant?.whitelabel?.enabled ? tenant.whitelabel : null
  // Kept as two separate groups (not one flat list) so every render target
  // can put clear space between them — the shop's own salutation vs. the
  // system's copyright line read as two unrelated things otherwise.
  const shopFooterLines = receiptConfig.footerMessage
    ? receiptConfig.footerMessage.split('\n').filter(Boolean)
    : ['Thank You For Your Purchase']
  const systemFooterLines = whitelabel
    ? [
        ...(whitelabel.hide_powered_by || !whitelabel.brand_name ? [] : [`Powered by ${whitelabel.brand_name}`]),
        ...((whitelabel.support_email || whitelabel.support_phone)
          ? [[whitelabel.support_email, whitelabel.support_phone].filter(Boolean).join(' | ')]
          : []),
      ]
    : ['Developed & Powered By Global Space Web', 'info@globalspaceweb.co.zw | +263773909307']

  const zimraPaymentType = ZIMRA_PAYMENT_MAP[receipt.paymentMethod] || 'Cash'

  // VAT breakdown — standard ZIMRA tax code D. VAT is inclusive in shelf prices.
  const taxableAmt = receipt.subtotal
  const vatAmt = receipt.tax

  // Escapes text dropped into the generated print document
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const row = (left, right) => `<div class="row"><span>${esc(left)}</span><span>${esc(right)}</span></div>`

  const handlePrint = () => {
    // Built from the receipt data with real CSS (not Tailwind class names) —
    // the print/PDF window has no access to the app's stylesheet, so relying
    // on className alone silently drops every border and layout rule.
    const itemsHtml = receipt.items.map((item) => `
      <div class="item">
        <div class="item-name">${esc(item.name)}</div>
        <div class="row indent"><span>${item.quantity} x ${esc(fmt(item.price))}</span><span>${esc(fmt(item.price * item.quantity))}</span></div>
        ${vatEnabled ? `<div class="tiny indent">HS: 000000 | Tax: D (${vatRate}%)</div>` : ''}
      </div>
    `).join('')

    // Fiscalisation is an optional add-on — if the tenant hasn't activated it,
    // the receipt shouldn't mention ZIMRA at all rather than flag itself as
    // "not yet fiscalised" to every customer.
    const fiscalHtml = showFiscalSection ? `
      <div class="center">
        <div class="fiscal-badge">ZIMRA FISCAL RECEIPT</div>
        <div class="tiny">Device ID: ${esc(deviceID)}</div>
        <div class="tiny">Receipt Global No: ${esc(receiptGlobalNo)}</div>
        ${fdmsQrUrl
          ? `<div class="qr-url-box"><div class="tiny bold">SCAN TO VERIFY</div><div class="tiny break">${esc(fdmsQrUrl)}</div></div>`
          : `<div class="qr-placeholder">QR pending<br/>FDMS sync</div>`}
        <div class="tiny">Verify: fdms.zimra.co.zw</div>
      </div>
    ` : ''

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${esc(receipt.receiptNumber)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; background: #fff; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .upper { text-transform: uppercase; }
          .tiny { font-size: 9px; }
          .break { word-break: break-all; }
          .indent { padding-left: 8px; }
          .store-name { font-size: 13px; font-weight: bold; text-transform: uppercase; }
          .row { display: flex; justify-content: space-between; }
          .row-4 { display: flex; justify-content: space-between; font-size: 10px; }
          .sep { border-top: 1px dashed #000; margin: 6px 0; }
          .sep-solid { border-top: 1px solid #000; margin: 4px 0; padding-top: 4px; }
          .item { margin-top: 6px; }
          .item-name { font-weight: bold; }
          .fiscal-badge { border: 2px solid #000; padding: 4px; margin: 4px 0; font-weight: bold; }
          .not-fiscal { border: 2px dashed #999; padding: 6px; text-align: center; }
          .qr-placeholder { border: 2px dashed #000; width: 80px; height: 80px; margin: 8px auto; display: flex; align-items: center; justify-content: center; font-size: 8px; text-align: center; }
          .qr-url-box { border: 1px solid #000; padding: 3px; margin: 6px 0; text-align: center; }
          @page { size: 80mm auto; margin: 0; }
          @media print { body { width: 72mm; } }
        </style>
      </head>
      <body>
        ${headerMessage ? `<div class="center tiny">${headerMessage.split('\n').filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('')}</div><div class="sep"></div>` : ''}
        <div class="center">
          ${receiptConfig.logoUrl ? `<img src="${esc(receiptConfig.logoUrl)}" alt="" style="max-height:48px;max-width:60mm;margin:0 auto 4px;display:block;" />` : ''}
          <div class="store-name">${esc(storeName)}</div>
          ${storeAddress ? `<div>${esc(storeAddress)}</div>` : ''}
          ${storeContacts ? `<div>${esc(storeContacts)}</div>` : ''}
          ${tin ? `<div>TIN: ${esc(tin)}</div>` : ''}
          ${vatNo ? `<div>VAT Reg: ${esc(vatNo)}</div>` : ''}
        </div>
        <div class="sep"></div>
        <div class="center bold">${showFiscalSection ? 'FISCAL TAX INVOICE' : 'RECEIPT'}</div>
        ${row('Receipt No:', receipt.receiptNumber)}
        ${row('Date:', dateStr)}
        ${row('Time:', timeStr)}
        ${row('Cashier:', receipt.cashier)}
        ${receipt.salespersonName ? row('Salesperson:', receipt.salespersonEmployeeNo ? `${receipt.salespersonName} (${receipt.salespersonEmployeeNo})` : receipt.salespersonName) : ''}
        <div class="sep"></div>
        <div class="bold upper">Items</div>
        ${itemsHtml}
        <div class="sep"></div>
        ${receipt.discountAmount > 0 ? row('Discount', `-${fmt(receipt.discountAmount)}`) : ''}
        ${vatEnabled ? row('Net (ex VAT)', fmt(receipt.subtotal)) : ''}
        ${vatEnabled ? row(`VAT ${vatRate}% (included)`, fmt(receipt.tax)) : ''}
        <div class="sep-solid bold">${row('TOTAL', fmt(receipt.total))}</div>
        <div class="sep"></div>
        <div class="bold upper">Payment</div>
        ${row(PAYMENT_DISPLAY[receipt.paymentMethod] || receipt.paymentMethod, fmt(receipt.total))}
        ${showFiscalSection ? `<div class="tiny">Type: ${esc(zimraPaymentType)}</div>` : ''}
        ${receipt.amountTendered != null ? row('Tendered', fmt(receipt.amountTendered)) : ''}
        ${receipt.changeDue != null ? row('Change', fmt(receipt.changeDue)) : ''}
        ${vatEnabled ? `
        <div class="sep"></div>
        <div class="bold upper">Tax Breakdown</div>
        <div class="row-4"><span>Code</span><span>Rate</span><span>Taxable</span><span>VAT</span></div>
        <div class="row-4"><span>D</span><span>${esc(vatRate)}%</span><span>${esc(fmt(taxableAmt))}</span><span>${esc(fmt(vatAmt))}</span></div>
        ` : ''}
        ${showFiscalSection ? `<div class="sep"></div>${fiscalHtml}` : ''}
        <div class="sep"></div>
        <div class="center tiny">
          ${shopFooterLines.map((l) => `<div>${esc(l)}</div>`).join('\n          ')}
          ${customLines.map((l) => `<div>${esc(l.label ? `${l.label}: ${l.value}` : l.value)}</div>`).join('\n          ')}
          <div style="margin-top: 10px;">
            ${systemFooterLines.map((l) => `<div>${esc(l)}</div>`).join('\n            ')}
          </div>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=400,height=800')
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }

  const handlePosPrint = async () => {
    setPosPrinting(true)
    try {
      const lines = []
      const dash = () => lines.push('-'.repeat(paperWidthChars))
      const rowLine = (left, right) => {
        const l = String(left ?? '')
        const r = String(right ?? '')
        const pad = Math.max(1, paperWidthChars - l.length - r.length)
        lines.push(l + ' '.repeat(pad) + r)
      }

      if (headerMessage) {
        for (const l of headerMessage.split('\n').filter(Boolean)) lines.push({ text: l, center: true })
        dash()
      }
      lines.push({ text: storeName, bold: true, center: true })
      if (storeAddress) lines.push({ text: storeAddress, center: true })
      if (storeContacts) lines.push({ text: storeContacts, center: true })
      if (tin) lines.push({ text: `TIN: ${tin}`, center: true })
      if (vatNo) lines.push({ text: `VAT Reg: ${vatNo}`, center: true })
      dash()
      lines.push({ text: showFiscalSection ? 'FISCAL TAX INVOICE' : 'RECEIPT', bold: true, center: true })
      rowLine('Receipt No:', receipt.receiptNumber)
      rowLine('Date:', dateStr)
      rowLine('Time:', timeStr)
      rowLine('Cashier:', receipt.cashier)
      if (receipt.salespersonName) {
        rowLine('Salesperson:', receipt.salespersonEmployeeNo ? `${receipt.salespersonName} (${receipt.salespersonEmployeeNo})` : receipt.salespersonName)
      }
      dash()
      lines.push({ text: 'ITEMS', bold: true })
      for (const item of receipt.items) {
        lines.push({ text: item.name, bold: true })
        rowLine(`  ${item.quantity} x ${fmt(item.price)}`, fmt(item.price * item.quantity))
      }
      dash()
      if (receipt.discountAmount > 0) rowLine('Discount', `-${fmt(receipt.discountAmount)}`)
      if (vatEnabled) {
        rowLine('Net (ex VAT)', fmt(receipt.subtotal))
        rowLine(`VAT ${vatRate}% (included)`, fmt(receipt.tax))
      }
      rowLine('TOTAL', fmt(receipt.total))
      dash()
      lines.push({ text: 'PAYMENT', bold: true })
      rowLine(PAYMENT_DISPLAY[receipt.paymentMethod] || receipt.paymentMethod, fmt(receipt.total))
      if (showFiscalSection) lines.push(`Type: ${zimraPaymentType}`)
      if (receipt.amountTendered != null) rowLine('Tendered', fmt(receipt.amountTendered))
      if (receipt.changeDue != null) rowLine('Change', fmt(receipt.changeDue))
      if (vatEnabled) {
        dash()
        lines.push({ text: 'TAX BREAKDOWN', bold: true })
        rowLine(`Code D  ${vatRate}%`, `${fmt(taxableAmt)} / ${fmt(vatAmt)}`)
      }
      if (showFiscalSection) {
        dash()
        lines.push({ text: 'ZIMRA FISCAL RECEIPT', bold: true, center: true })
        lines.push({ text: `Device ID: ${deviceID}`, center: true })
        lines.push({ text: `Receipt Global No: ${receiptGlobalNo}`, center: true })
        lines.push({ text: 'Verify: fdms.zimra.co.zw', center: true })
      }
      dash()
      for (const l of shopFooterLines) lines.push({ text: l, center: true })
      for (const l of customLines) lines.push({ text: l.label ? `${l.label}: ${l.value}` : l.value, center: true })
      // Blank lines (thermal printers have no CSS margin) so the shop's own
      // salutation is clearly separated from the system copyright line below.
      lines.push({ text: '', center: true })
      lines.push({ text: '', center: true })
      for (const l of systemFooterLines) lines.push({ text: l, center: true })

      await printToPosPrinter(lines, receiptConfig.printerConnection)
      toast.success('Sent to POS printer')
    } catch (err) {
      toast.error(err.message || 'Failed to print to POS printer')
    } finally {
      setPosPrinting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {showFiscalSection ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <Printer className="h-5 w-5 text-slate-400" />
            )}
            <span className="font-bold text-slate-900 dark:text-white">
              {showFiscalSection ? 'Fiscal Receipt' : 'Receipt'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Receipt scroll area */}
        <div className="flex-1 overflow-auto p-4">
          {/* Thermal receipt preview */}
          <div
            ref={receiptRef}
            className="mx-auto w-full max-w-[300px] rounded-sm bg-white p-4 font-mono text-[11px] leading-tight text-black shadow-md"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {headerMessage && (
              <>
                <div className="text-center text-[10px]">
                  {headerMessage.split('\n').filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
                </div>
                <div className="my-2 border-t border-dashed border-black" />
              </>
            )}

            {/* Store header — only lines this tenant actually configured */}
            <div className="text-center">
              {receiptConfig.logoUrl && (
                <img src={receiptConfig.logoUrl} alt="" className="mx-auto mb-1 max-h-12 max-w-[60mm] object-contain" />
              )}
              <div className="text-sm font-bold uppercase">{storeName}</div>
              {storeAddress && <div>{storeAddress}</div>}
              {storeContacts && <div>{storeContacts}</div>}
              {tin && <div>TIN: {tin}</div>}
              {vatNo && <div>VAT Reg: {vatNo}</div>}
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* Receipt info */}
            <div className="text-center font-bold">{showFiscalSection ? 'FISCAL TAX INVOICE' : 'RECEIPT'}</div>
            <div className="mt-1 flex justify-between">
              <span>Receipt No:</span>
              <span>{receipt.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span>{timeStr}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{receipt.cashier}</span>
            </div>
            {receipt.salespersonName && (
              <div className="flex justify-between">
                <span>Salesperson:</span>
                <span>{receipt.salespersonEmployeeNo ? `${receipt.salespersonName} (${receipt.salespersonEmployeeNo})` : receipt.salespersonName}</span>
              </div>
            )}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Items */}
            <div className="font-bold uppercase">Items</div>
            {receipt.items.map((item, i) => (
              <div key={i} className="mt-1">
                <div className="font-semibold">{item.name}</div>
                <div className="flex justify-between pl-2">
                  <span>{item.quantity} x {fmt(item.price)}</span>
                  <span>{fmt(item.price * item.quantity)}</span>
                </div>
                {vatEnabled && (
                  <div className="pl-2 text-[9px] text-slate-500">HS: 000000 | Tax: D ({vatRate}%)</div>
                )}
              </div>
            ))}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Totals */}
            {receipt.discountAmount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{fmt(receipt.discountAmount)}</span>
              </div>
            )}
            {vatEnabled && (
              <>
                <div className="flex justify-between">
                  <span>Net (ex VAT)</span>
                  <span>{fmt(receipt.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT {vatRate}% (included)</span>
                  <span>{fmt(receipt.tax)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-black pt-1 font-bold">
              <span>TOTAL</span>
              <span>{fmt(receipt.total)}</span>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* Payment */}
            <div className="font-bold uppercase">Payment</div>
            <div className="flex justify-between">
              <span>{PAYMENT_DISPLAY[receipt.paymentMethod] || receipt.paymentMethod}</span>
              <span>{fmt(receipt.total)}</span>
            </div>
            {showFiscalSection && (
              <div className="text-[9px] text-slate-500">Type: {zimraPaymentType}</div>
            )}
            {receipt.amountTendered != null && (
              <div className="flex justify-between">
                <span>Tendered</span>
                <span>{fmt(receipt.amountTendered)}</span>
              </div>
            )}
            {receipt.changeDue != null && (
              <div className="flex justify-between">
                <span>Change</span>
                <span>{fmt(receipt.changeDue)}</span>
              </div>
            )}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Tax table */}
            {vatEnabled && (
              <>
                <div className="font-bold uppercase">Tax Breakdown</div>
                <div className="mt-1 flex justify-between text-[10px]">
                  <span>Code</span>
                  <span>Rate</span>
                  <span>Taxable</span>
                  <span>VAT</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>D</span>
                  <span>{vatRate}%</span>
                  <span>{fmt(taxableAmt)}</span>
                  <span>{fmt(vatAmt)}</span>
                </div>
              </>
            )}

            {/* Fiscalisation is an optional add-on — if it isn't active for this
                tenant, the receipt shouldn't mention ZIMRA at all. */}
            {showFiscalSection && (
              <>
                <div className="my-2 border-t border-dashed border-black" />
                <div className="text-center">
                  <div className="border-2 border-black p-1 font-bold uppercase">
                    ZIMRA Fiscal Receipt
                  </div>
                  <div className="mt-1 text-[9px]">Device ID: {deviceID}</div>
                  <div className="text-[9px]">Receipt Global No: {receiptGlobalNo}</div>
                  {fdmsQrUrl ? (
                    /* Real FDMS verification URL — print as scannable QR via thermal printer driver */
                    <div className="mx-auto my-2 border border-black p-1">
                      <div className="text-[8px] font-bold">SCAN TO VERIFY</div>
                      <div className="mt-0.5 break-all text-[7px] leading-tight">{fdmsQrUrl}</div>
                    </div>
                  ) : (
                    <div className="mx-auto my-2 flex h-20 w-20 items-center justify-center border-2 border-dashed border-black text-[8px] leading-tight text-slate-400">
                      QR pending<br />FDMS sync
                    </div>
                  )}
                  <div className="text-[9px]">Verify: fdms.zimra.co.zw</div>
                </div>
              </>
            )}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Footer — shop's own salutation, then a deliberate gap, then the
                system copyright line, so the two are never read as one thing */}
            <div className="text-center text-[9px]">
              {shopFooterLines.map((l, i) => <div key={i}>{l}</div>)}
              {customLines.map((l, i) => <div key={`c${i}`}>{l.label ? `${l.label}: ${l.value}` : l.value}</div>)}
              <div className="mt-2.5">
                {systemFooterLines.map((l, i) => <div key={`s${i}`}>{l}</div>)}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          {/* POS Printer is optional per tenant (Receipts Config) — when
              disabled the modal only offers the standard Print flow. */}
          <div className={`grid gap-2 ${showPosPrintButton ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-2 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Printer className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Print</span>
            </button>
            {showPosPrintButton && (
              <button
                onClick={handlePosPrint}
                disabled={posPrinting}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-brand-600 px-2 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-60 dark:text-brand-400 dark:hover:bg-slate-800"
              >
                <Usb className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{posPrinting ? 'Printing…' : 'POS Printer'}</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

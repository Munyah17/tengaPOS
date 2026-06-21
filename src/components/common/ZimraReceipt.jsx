import { useRef } from 'react'
import { Printer, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { useFiscalStore } from '@/stores/fiscalStore'
import { formatCurrency } from '@/utils/formatters'

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
  const receiptRef = useRef(null)
  const fiscal = useFiscalStore()

  const isFiscalised = fiscal.isEnabled && fiscal.isRegistered

  const now = new Date(receipt.date)
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const storeName = fiscal.branchName || 'TENGAPOS DEMO STORE'
  const storeAddress = fiscal.branchAddress || '123 Samora Machel Ave, Harare'
  const storeContacts = fiscal.branchContacts || '+263 77 123 4567'
  const tin = fiscal.tin || 'XXXXXXXXXX'
  const vatNo = fiscal.vatNumber || 'Not Configured'
  const deviceID = fiscal.deviceID ? fiscal.deviceID.padStart(10, '0') : '0000000000'
  const receiptGlobalNo = String(fiscal.lastReceiptGlobalNo).padStart(10, '0')

  const zimraPaymentType = ZIMRA_PAYMENT_MAP[receipt.paymentMethod] || 'Cash'

  // VAT breakdown — standard ZIMRA tax code D = 15% VAT
  const vatRate = 0.15
  const taxableAmt = receipt.subtotal
  const vatAmt = receipt.tax

  const handlePrint = () => {
    const printContents = receiptRef.current.innerHTML
    const printWindow = window.open('', '_blank', 'width=400,height=800')
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ZIMRA Receipt - ${receipt.receiptNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 72mm; padding: 4mm; background: white; color: black; }
          .receipt-line { white-space: pre; display: block; }
          .center { text-align: center; }
          .separator { border-top: 1px dashed #000; margin: 4px 0; }
          .qr-placeholder { border: 2px solid #000; width: 80px; height: 80px; margin: 8px auto; display: flex; align-items: center; justify-content: center; font-size: 9px; text-align: center; }
          .fiscal-badge { border: 2px solid #000; padding: 4px; margin: 4px 0; text-align: center; font-weight: bold; }
          .not-fiscal { border: 2px dashed #999; padding: 4px; margin: 4px 0; text-align: center; }
        </style>
      </head>
      <body>
        <div id="print-receipt">${printContents}</div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
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
            {isFiscalised ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            <span className="font-bold text-slate-900 dark:text-white">
              {isFiscalised ? 'Fiscal Receipt' : 'Receipt Preview'}
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
            {/* Store header */}
            <div className="text-center">
              <div className="text-sm font-bold uppercase">{storeName}</div>
              <div>{storeAddress}</div>
              <div>{storeContacts}</div>
              <div>TIN: {tin}</div>
              <div>VAT Reg: {vatNo}</div>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* Receipt info */}
            <div className="text-center font-bold">FISCAL TAX INVOICE</div>
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

            <div className="my-2 border-t border-dashed border-black" />

            {/* Items */}
            <div className="font-bold uppercase">Items</div>
            {receipt.items.map((item, i) => (
              <div key={i} className="mt-1">
                <div className="font-semibold">{item.name}</div>
                <div className="flex justify-between pl-2">
                  <span>{item.quantity} x {formatCurrency(item.price)}</span>
                  <span>{formatCurrency(item.price * item.quantity)}</span>
                </div>
                <div className="pl-2 text-[9px] text-slate-500">HS: 000000 | Tax: D (15%)</div>
              </div>
            ))}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Totals */}
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(receipt.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT (15%)</span>
              <span>{formatCurrency(receipt.tax)}</span>
            </div>
            <div className="flex justify-between border-t border-black pt-1 font-bold">
              <span>TOTAL</span>
              <span>{formatCurrency(receipt.total)}</span>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* Payment */}
            <div className="font-bold uppercase">Payment</div>
            <div className="flex justify-between">
              <span>{PAYMENT_DISPLAY[receipt.paymentMethod] || receipt.paymentMethod}</span>
              <span>{formatCurrency(receipt.total)}</span>
            </div>
            <div className="text-[9px] text-slate-500">Type: {zimraPaymentType}</div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* Tax table */}
            <div className="font-bold uppercase">Tax Breakdown</div>
            <div className="mt-1 flex justify-between text-[10px]">
              <span>Code</span>
              <span>Rate</span>
              <span>Taxable</span>
              <span>VAT</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>D</span>
              <span>15%</span>
              <span>{formatCurrency(taxableAmt)}</span>
              <span>{formatCurrency(vatAmt)}</span>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            {/* ZIMRA fiscal section */}
            {isFiscalised ? (
              <div className="text-center">
                <div className="border-2 border-black p-1 font-bold uppercase">
                  ZIMRA Fiscal Receipt
                </div>
                <div className="mt-1 text-[9px]">Device ID: {deviceID}</div>
                <div className="text-[9px]">Receipt Global No: {receiptGlobalNo}</div>
                {/* QR code placeholder — populated by Edge Function on live fiscalisation */}
                <div className="mx-auto my-2 flex h-20 w-20 items-center justify-center border-2 border-black text-[9px] leading-tight">
                  ZIMRA<br />QR<br />CODE
                </div>
                <div className="text-[9px]">Verify: zimra.co.zw/verify</div>
              </div>
            ) : (
              <div className="border border-dashed border-amber-500 p-2 text-center">
                <div className="text-[9px] font-bold text-amber-700">NOT YET FISCALISED</div>
                <div className="text-[9px] text-amber-600">Configure ZIMRA in Settings</div>
              </div>
            )}

            <div className="my-2 border-t border-dashed border-black" />

            {/* Footer */}
            <div className="text-center text-[9px]">
              <div>Thank you for your business!</div>
              <div>Powered by tengaPOS</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Printer className="h-4 w-4" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  )
}

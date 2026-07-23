import Invoicing from '@/pages/Invoicing'

// Workshop Mode's built-in Quotations -- the same quotation/invoice engine
// as Invoicing.jsx (documents table, PDF export, status tracking), just
// without the Accounting & ERP add-on gate and locked to quotations only.
export default function Quotations() {
  return <Invoicing standalone />
}

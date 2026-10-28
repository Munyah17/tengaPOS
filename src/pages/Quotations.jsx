import Invoicing from '@/pages/Invoicing'

// Workshop Mode's built-in Quotations & Invoices -- the same
// quotation/invoice engine as Invoicing.jsx (documents table, PDF export,
// status tracking), without the Accounting & ERP add-on gate. Invoices show
// up here too because JobCards.jsx can create one straight from a job card.
export default function Quotations() {
  return <Invoicing standalone />
}

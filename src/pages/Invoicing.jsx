import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, FileText, Receipt, Download, Printer, ArrowRightLeft, Trash2, X, RefreshCw, Wrench } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import DateInput from '@/components/common/DateInput'
import { useAuthStore } from '@/stores/authStore'
import { useReceiptConfigStore } from '@/stores/receiptConfigStore'
import {
  fetchDocuments, insertDocument, updateDocument, deleteDocument, convertQuotationToInvoice,
  fetchProducts, fetchCustomers, findOrCreateCustomer,
} from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { formatCurrency, formatDate, generateDocNumber } from '@/utils/formatters'
import { generateDocumentPDF } from '@/utils/invoicePdf'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const BLANK_ITEM = { description: '', qty: 1, unit_price: 0, discount_pct: 0 }
const BLANK_FORM = {
  customerName: '', customerEmail: '', customerPhone: '', customerAddress: '',
  items: [{ ...BLANK_ITEM }], notes: '', validUntil: '', dueDate: '',
}

// `standalone` is set by Quotations.jsx (Workshop Mode's built-in
// quotations page) -- same document engine, no Accounting & ERP add-on
// gate, and locked to quotations only (invoices stay part of the paid add-on).
export default function Invoicing({ standalone = false } = {}) {
  const { tenant, branch, user } = useAuthStore()
  const navigate = useNavigate()
  const receiptConfig = useReceiptConfigStore()
  const [docType, setDocType] = useState('quotation')
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  // Which line-item row (by index) currently has its product-suggestion
  // dropdown open, so typing in one row's description doesn't pop up
  // suggestions under every other row.
  const [autocompleteRow, setAutocompleteRow] = useState(null)

  useEffect(() => {
    if (!tenant?.id) return
    fetchProducts(tenant.id).then(setProducts).catch(() => {})
    fetchCustomers(tenant.id).then(setCustomers).catch(() => {})
  }, [tenant?.id])

  const vatEnabled = tenant?.vat_enabled !== false
  const vatRate = tenant?.vat_rate ?? 15.5
  const fmt = (n) => formatCurrency(n, tenant?.currency)

  const loadDocuments = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['documents', tenant.id], () => fetchDocuments(tenant.id), {
      onData: setDocuments,
      onError: () => toast.error('Failed to load documents'),
      onLoadingChange: setLoading,
    })
  }
  useEffect(loadDocuments, [tenant?.id])
  useEffect(() => {
    window.addEventListener('tengapos:force-refresh', loadDocuments)
    return () => window.removeEventListener('tengapos:force-refresh', loadDocuments)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  const filtered = documents.filter((d) => d.doc_type === docType)

  const openCreate = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setSelectedCustomerId('')
    setShowForm(true)
  }

  const openEdit = (doc) => {
    setEditing(doc)
    setSelectedCustomerId('')
    setForm({
      customerName: doc.customer_name || '',
      customerEmail: doc.customer_email || '',
      customerPhone: doc.customer_phone || '',
      customerAddress: doc.customer_address || '',
      items: doc.items?.length ? doc.items : [{ ...BLANK_ITEM }],
      notes: doc.notes || '',
      validUntil: doc.valid_until || '',
      dueDate: doc.due_date || '',
    })
    setShowForm(true)
  }

  // Picking a saved customer autofills every field below -- they stay
  // editable either way, so a repeat customer's changed number/address
  // still gets typed in and saved back (see findOrCreateCustomer on save).
  const selectCustomer = (customerId) => {
    setSelectedCustomerId(customerId)
    const c = customers.find((c) => c.id === customerId)
    if (c) {
      setForm((f) => ({ ...f, customerName: c.name || '', customerEmail: c.email || '', customerPhone: c.phone || '', customerAddress: c.address || '' }))
    }
  }

  const updateItem = (i, field, value) => setForm((f) => ({
    ...f,
    items: f.items.map((it, idx) => idx === i ? { ...it, [field]: value } : it),
  }))
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] }))
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const pickProduct = (i, product) => {
    setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, description: product.name, unit_price: product.price } : it) }))
    setAutocompleteRow(null)
  }
  const productMatches = (query) => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return products.filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 8)
  }

  const computeTotals = (items) => {
    const grossTotal = items.reduce((s, i) => s + (i.qty * i.unit_price * (1 - (i.discount_pct || 0) / 100)), 0)
    if (!vatEnabled) return { subtotal: grossTotal, vatAmount: 0, total: grossTotal }
    const vatAmount = grossTotal * (vatRate / (100 + vatRate))
    return { subtotal: grossTotal - vatAmount, vatAmount, total: grossTotal }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.customerName.trim()) { toast.error('Customer name is required'); return }
    const validItems = form.items.filter((i) => i.description.trim() && i.qty > 0)
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const { subtotal, vatAmount, total } = computeTotals(validItems)
      const payload = {
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim() || null,
        customerPhone: form.customerPhone.trim() || null,
        customerAddress: form.customerAddress.trim() || null,
        items: validItems,
        subtotal, vatAmount, total,
        notes: form.notes.trim() || null,
        validUntil: form.validUntil || null,
        dueDate: form.dueDate || null,
      }
      if (editing) {
        const updated = await updateDocument(editing.id, payload)
        setDocuments((prev) => prev.map((d) => d.id === editing.id ? updated : d))
        toast.success(`${docType === 'invoice' ? 'Invoice' : 'Quotation'} updated`)
      } else {
        const created = await insertDocument(tenant.id, branch?.id, user?.id, {
          ...payload,
          docType,
          docNumber: generateDocNumber(docType === 'invoice' ? 'INV' : 'QUO'),
        })
        setDocuments((prev) => [created, ...prev])
        toast.success(`${docType === 'invoice' ? 'Invoice' : 'Quotation'} created`)
      }
      // Best-effort, non-blocking: save/update the customer record so next
      // time this same person is quoted, they're a pick from the list
      // instead of retyping everything.
      if (tenant?.id) {
        findOrCreateCustomer(tenant.id, {
          name: payload.customerName, phone: payload.customerPhone, email: payload.customerEmail, address: payload.customerAddress,
        }).then((id) => { if (id) setCustomers((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, { id, name: payload.customerName, phone: payload.customerPhone }])) })
      }
      setShowForm(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (doc) => {
    const prev = documents
    setDocuments((d) => d.filter((x) => x.id !== doc.id))
    try {
      await deleteDocument(doc.id)
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
      setDocuments(prev)
    }
  }

  const handleConvert = async (doc) => {
    try {
      const invoice = await convertQuotationToInvoice(doc, generateDocNumber('INV'), user?.id)
      setDocuments((prev) => [invoice, ...prev.map((d) => d.id === doc.id ? { ...d, status: 'accepted', converted_to_id: invoice.id } : d)])
      toast.success(`Converted to invoice ${invoice.doc_number}`)
    } catch (err) {
      toast.error(err.message || 'Failed to convert')
    }
  }

  const handleStatusChange = async (doc, status) => {
    try {
      const updated = await updateDocument(doc.id, { ...doc, status, customerName: doc.customer_name, subtotal: doc.subtotal, vatAmount: doc.vat_amount, total: doc.total })
      setDocuments((prev) => prev.map((d) => d.id === doc.id ? updated : d))
    } catch (err) {
      toast.error(err.message || 'Failed to update status')
    }
  }

  const handlePDF = async (doc) => {
    await generateDocumentPDF(doc, {
      name: receiptConfig.storeName || tenant?.name,
      address: receiptConfig.storeAddress,
      contacts: receiptConfig.storeContacts,
      tin: receiptConfig.tin,
      vatNumber: receiptConfig.vatNumber,
      logoUrl: receiptConfig.logoUrl,
      bankDetails: receiptConfig.bankDetails,
    }, tenant?.currency, tenant?.whitelabel?.enabled ? tenant.whitelabel.primary_color : null)
  }

  const { subtotal: formSubtotal, vatAmount: formVat, total: formTotal } = computeTotals(
    form.items.filter((i) => i.description.trim() && i.qty > 0),
  )

  const erpUnlocked = standalone || tenant?.features?.accounting_erp === true
  if (!erpUnlocked) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Invoicing</h1>
          <p className="text-sm text-slate-500">Quotations and invoices</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">Invoicing isn't active yet</h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is part of the Accounting & ERP add-on ($5/month). Request it from Settings and it'll unlock here once approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{standalone ? 'Quotations' : 'Invoicing'}</h1>
          <p className="text-sm text-slate-500">{standalone ? 'Estimate a job for the customer before you start work' : 'Quotations and invoices for your customers'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadDocuments} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New {docType === 'invoice' ? 'Invoice' : 'Quotation'}
          </Button>
        </div>
      </div>

      {/* Type tabs — Quotations-only in standalone (Workshop) mode, since
          invoices stay part of the paid Accounting & ERP add-on */}
      {!standalone && (
        <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setDocType('quotation')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${docType === 'quotation' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          >
            <FileText className="h-4 w-4" /> Quotations
          </button>
          <button
            onClick={() => setDocType('invoice')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${docType === 'invoice' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          >
            <Receipt className="h-4 w-4" /> Invoices
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No {docType === 'invoice' ? 'invoices' : 'quotations'} yet — click "New {docType === 'invoice' ? 'Invoice' : 'Quotation'}" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['No.', 'Customer', 'Date', 'Total', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <motion.tr key={doc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {doc.doc_number}
                      {doc.converted_to_id && <span className="ml-1.5 text-xs text-slate-400">→ invoiced</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{doc.customer_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(doc.total)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={doc.status}
                        onChange={(e) => handleStatusChange(doc, e.target.value)}
                        className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[doc.status] || STATUS_COLORS.draft}`}
                      >
                        {['draft', 'sent', doc.doc_type === 'invoice' ? 'paid' : 'accepted', 'cancelled'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(doc)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title="Edit">
                          <FileText className="h-4 w-4" />
                        </button>
                        <button onClick={() => handlePDF(doc)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" title="Download PDF">
                          <Download className="h-4 w-4" />
                        </button>
                        {doc.doc_type === 'quotation' && !doc.converted_to_id && (
                          <button onClick={() => handleConvert(doc)} className="rounded-lg p-1.5 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950" title="Convert to Invoice">
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                        )}
                        {standalone && doc.doc_type === 'quotation' && doc.status === 'accepted' && (
                          <button
                            onClick={() => navigate('/app/job-cards', { state: { fromQuotation: doc } })}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                            title="Create Job Card from this quotation"
                          >
                            <Wrench className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(doc)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={`${editing ? 'Edit' : 'New'} ${docType === 'invoice' ? 'Invoice' : 'Quotation'}`}>
        <form onSubmit={handleSave} className="space-y-4">
          {customers.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Saved Customer</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => selectCustomer(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Type new customer details below…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer Name *</label>
              <input type="text" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={form.customerEmail} onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input type="text" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{docType === 'invoice' ? 'Due Date' : 'Valid Until'}</label>
              <DateInput
                value={docType === 'invoice' ? form.dueDate : form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, [docType === 'invoice' ? 'dueDate' : 'validUntil']: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
            <input type="text" value={form.customerAddress} onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Line Items</label>
              <button type="button" onClick={addItem} className="text-xs font-semibold text-brand-600 hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5">
                  <div className="relative col-span-5">
                    <input
                      type="text" placeholder="Description — type an SKU or product name" value={item.description}
                      onChange={(e) => { updateItem(i, 'description', e.target.value); setAutocompleteRow(i) }}
                      onFocus={() => setAutocompleteRow(i)}
                      onBlur={() => setTimeout(() => setAutocompleteRow((r) => (r === i ? null : r)), 150)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    {autocompleteRow === i && productMatches(item.description).length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                        {productMatches(item.description).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => pickProduct(i, p)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            <span className="truncate text-slate-700 dark:text-slate-200">{p.name}{p.sku ? ` (${p.sku})` : ''}</span>
                            <span className="flex-shrink-0 font-semibold text-slate-500">{fmt(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number" placeholder="Qty" min="0" value={item.qty}
                    onChange={(e) => updateItem(i, 'qty', Number(e.target.value) || 0)}
                    className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="number" placeholder="Price" min="0" step="0.01" value={item.unit_price}
                    onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value) || 0)}
                    className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="number" placeholder="Disc %" min="0" max="100" value={item.discount_pct}
                    onChange={(e) => updateItem(i, 'discount_pct', Number(e.target.value) || 0)}
                    className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="flex justify-between text-slate-500"><span>Subtotal (ex VAT)</span><span>{fmt(formSubtotal)}</span></div>
            {vatEnabled && <div className="flex justify-between text-slate-500"><span>VAT {vatRate}%</span><span>{fmt(formVat)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-slate-700 dark:text-white"><span>Total</span><span>{fmt(formTotal)}</span></div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

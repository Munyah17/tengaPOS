import { useState, useEffect, useMemo } from 'react'
import { Plus, Wrench, Trash2, Car, User, Receipt, Edit3, AlertTriangle } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { useCartStore } from '@/stores/cartStore'
import {
  fetchJobCards, fetchCustomers, createCustomer, createVehicle, createJobCard, updateJobCard,
  fetchTechnicians, fetchProducts, findDuplicateCustomer, findDuplicateVehicle, createQuotationFromJobCard,
} from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

const STATUS_META = {
  open: { label: 'Open', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400' },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400' },
  completed: { label: 'Completed', bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500' },
}

const exportColumns = [
  { header: 'Job Card', key: 'job_card_no' },
  { header: 'Customer', key: 'customer' },
  { header: 'Vehicle', key: 'vehicle' },
  { header: 'Status', key: 'status' },
  { header: 'Total', key: 'total' },
]

const BLANK_ITEM = { description: '', qty: 1, unit_price: 0, product_id: null }
const BLANK_PART = { description: '', qty: 1 }

function JobCardModal({ tenant, branch, customers, technicians, products, existing, prefill, onClose, onSaved }) {
  const { user } = useAuthStore()
  const [customerId, setCustomerId] = useState(existing?.customer_id || (prefill ? '__new__' : ''))
  const [newCustomerName, setNewCustomerName] = useState(prefill?.customerName || '')
  const [newCustomerPhone, setNewCustomerPhone] = useState(prefill?.customerPhone || '')
  const [customerMatch, setCustomerMatch] = useState(null)
  const [vehicleId, setVehicleId] = useState(existing?.vehicle_id || '')
  const [newVehicle, setNewVehicle] = useState({ make: '', model: '', regNumber: '' })
  const [vehicleMatch, setVehicleMatch] = useState(null)
  const [description, setDescription] = useState(existing?.description || '')
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis || '')
  const [partsRequested, setPartsRequested] = useState(existing?.parts_requested?.length ? existing.parts_requested : [{ ...BLANK_PART }])
  const [assignedTo, setAssignedTo] = useState(existing?.assigned_to || '')
  const [items, setItems] = useState(
    existing?.items?.length ? existing.items
      : prefill?.items?.length ? prefill.items.map((i) => ({ ...i, product_id: null }))
      : [{ ...BLANK_ITEM }],
  )
  const [saving, setSaving] = useState(false)
  const [creatingQuote, setCreatingQuote] = useState(false)

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const isNewCustomer = customerId === '__new__'
  const isNewVehicle = vehicleId === '__new__'

  const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addItemRow = () => setItems((prev) => [...prev, { ...BLANK_ITEM }])
  const removeItemRow = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i))
  const pickProduct = (i, productId) => {
    const p = products.find((p) => p.id === productId)
    setItem(i, { product_id: productId || null, description: p ? p.name : items[i].description, unit_price: p ? p.price : items[i].unit_price })
  }

  const setPart = (i, patch) => setPartsRequested((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const addPartRow = () => setPartsRequested((prev) => [...prev, { ...BLANK_PART }])
  const removePartRow = (i) => setPartsRequested((prev) => prev.filter((_, idx) => idx !== i))

  // Duplicate detection -- a phone or reg number that already matches an
  // existing record surfaces a "use this instead" prompt rather than
  // silently creating a second customer/vehicle for the same person/car.
  const checkCustomerDuplicate = async () => {
    if (!newCustomerPhone.trim()) { setCustomerMatch(null); return }
    try {
      const match = await findDuplicateCustomer(tenant.id, newCustomerPhone)
      setCustomerMatch(match)
    } catch { /* non-blocking */ }
  }
  const checkVehicleDuplicate = async () => {
    if (!newVehicle.regNumber.trim()) { setVehicleMatch(null); return }
    try {
      const match = await findDuplicateVehicle(tenant.id, newVehicle.regNumber)
      setVehicleMatch(match)
    } catch { /* non-blocking */ }
  }

  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0)

  // The diagnosis (recorded once the technician's actually looked at the
  // car) becomes the customer's quotation -- the reverse of Quotations.jsx's
  // "Create Job Card" on an accepted quote.
  const createQuote = async () => {
    setCreatingQuote(true)
    try {
      // Uses whatever's currently typed (diagnosis/items), not the
      // last-saved copy -- so diagnose-then-quote works in one sitting
      // without needing a Save first.
      const doc = await createQuotationFromJobCard(tenant.id, branch?.id, user?.id, {
        id: existing.id,
        customers: existing.customers,
        diagnosis,
        items: items.filter((it) => it.description.trim()),
      }, {
        vatEnabled: tenant?.vat_enabled !== false, vatRate: tenant?.vat_rate ?? 15.5,
      })
      toast.success(`Quotation ${doc.doc_number} created`)
    } catch (err) {
      toast.error(err.message || 'Failed to create quotation')
    } finally {
      setCreatingQuote(false)
    }
  }

  const save = async () => {
    if (isNewCustomer && !newCustomerName.trim()) { toast.error('Customer name is required'); return }
    if (!isNewCustomer && !customerId) { toast.error('Select or add a customer'); return }
    if (isNewVehicle && !newVehicle.regNumber.trim() && !newVehicle.make.trim()) { toast.error('Add at least a reg number or make/model'); return }
    if (!isNewVehicle && !vehicleId) { toast.error('Select or add a vehicle'); return }
    const cleanItems = items.filter((it) => it.description.trim())
    if (cleanItems.length === 0) { toast.error('Add at least one line item'); return }
    const cleanParts = partsRequested.filter((p) => p.description.trim())

    setSaving(true)
    try {
      const patch = {
        description, diagnosis, partsRequested: cleanParts,
        items: cleanItems.map((it) => ({ description: it.description, qty: Number(it.qty) || 1, unit_price: Number(it.unit_price) || 0, product_id: it.product_id })),
        assignedTo: assignedTo || null,
      }

      if (existing) {
        await updateJobCard(existing.id, {
          description: patch.description, diagnosis: patch.diagnosis,
          parts_requested: patch.partsRequested, items: patch.items,
          subtotal: total, total, assigned_to: patch.assignedTo,
        })
        toast.success('Job card updated')
      } else {
        let finalCustomerId = customerId
        if (isNewCustomer) {
          const c = await createCustomer(tenant.id, { name: newCustomerName.trim(), phone: newCustomerPhone.trim() })
          finalCustomerId = c.id
        }
        let finalVehicleId = vehicleId
        if (isNewVehicle) {
          const v = await createVehicle(tenant.id, finalCustomerId, newVehicle)
          finalVehicleId = v.id
        }
        await createJobCard(tenant.id, { branchId: branch?.id, customerId: finalCustomerId, vehicleId: finalVehicleId, createdBy: user?.id, quotationId: prefill?.quotationId || null, ...patch })
        toast.success('Job card created')
      }
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to save job card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen title={existing ? `Job Card ${existing.job_card_no}` : 'New Job Card'} onClose={onClose} size="lg">
      <div className="space-y-4">
        {!existing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Customer</label>
              <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(''); setCustomerMatch(null) }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">Select customer…</option>
                <option value="__new__">+ New customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
              </select>
              {isNewCustomer && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Name" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} onBlur={checkCustomerDuplicate} placeholder="Phone" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  </div>
                  {customerMatch && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
                      <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Matches existing customer "{customerMatch.name}"</span>
                      <button onClick={() => { setCustomerId(customerMatch.id); setCustomerMatch(null) }} className="flex-shrink-0 font-semibold underline">Use this</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Vehicle</label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customerId} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">Select vehicle…</option>
                <option value="__new__">+ New vehicle</option>
                {!isNewCustomer && selectedCustomer?.vehicles?.map((v) => (
                  <option key={v.id} value={v.id}>{[v.make, v.model, v.reg_number].filter(Boolean).join(' ')}</option>
                ))}
              </select>
              {isNewVehicle && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newVehicle.make} onChange={(e) => setNewVehicle((v) => ({ ...v, make: e.target.value }))} placeholder="Make" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <input value={newVehicle.model} onChange={(e) => setNewVehicle((v) => ({ ...v, model: e.target.value }))} placeholder="Model" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <input value={newVehicle.regNumber} onChange={(e) => setNewVehicle((v) => ({ ...v, regNumber: e.target.value }))} onBlur={checkVehicleDuplicate} placeholder="Reg Number" className="col-span-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  </div>
                  {vehicleMatch && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
                      <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> "{vehicleMatch.reg_number}" already on file for {vehicleMatch.customers?.name || 'another customer'}</span>
                      <button onClick={() => { setVehicleId(vehicleMatch.id); setVehicleMatch(null) }} className="flex-shrink-0 font-semibold underline">Use this</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Description of work</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>

        {/* Diagnosis only shows up once editing an existing job card -- it's
            recorded after inspection, not known at intake, and from here it
            can turn straight into a quotation for the customer. */}
        {existing && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500">Diagnosis</label>
              {diagnosis.trim() && (
                <button type="button" onClick={createQuote} disabled={creatingQuote} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400 disabled:opacity-50">
                  {creatingQuote ? 'Creating quotation…' : 'Create Quotation from this'}
                </button>
              )}
            </div>
            <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} placeholder="What the technician found" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Assign mechanic</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="">Unassigned</option>
            {technicians.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500">Parts Requested (not yet billed)</label>
            <button onClick={addPartRow} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">+ Add</button>
          </div>
          <div className="space-y-1.5">
            {partsRequested.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input value={p.description} onChange={(e) => setPart(i, { description: e.target.value })} placeholder="Part needed" className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                <input type="number" min="1" value={p.qty} onChange={(e) => setPart(i, { qty: e.target.value })} className="w-16 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                <button onClick={() => removePartRow(i)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500">Parts & Labor (billable)</label>
            <button onClick={addItemRow} className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400">+ Add line</button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={it.product_id || ''}
                  onChange={(e) => pickProduct(i, e.target.value)}
                  className="w-full flex-shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:w-32"
                >
                  <option value="">Labor / custom</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  value={it.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                  placeholder="Description"
                  className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="number" min="1" value={it.qty}
                  onChange={(e) => setItem(i, { qty: e.target.value })}
                  className="w-14 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="number" min="0" step="0.01" value={it.unit_price}
                  onChange={(e) => setItem(i, { unit_price: e.target.value })}
                  className="w-20 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button onClick={() => removeItemRow(i)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-sm font-bold text-slate-900 dark:text-white">Total: {formatCurrency(total)}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="workshop" onClick={save} disabled={saving}>{saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Job Card'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function JobCards() {
  const { tenant, branch } = useAuthStore()
  const cart = useCartStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [jobCards, setJobCards] = useState([])
  const [customers, setCustomers] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [products, setProducts] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [filter, setFilter] = useState('active')

  // Arrived here via "Create Job Card" on an accepted quotation
  // (Quotations.jsx / Invoicing.jsx) -- pre-fill the new job card with the
  // quotation's customer and line items; the vehicle still needs picking
  // since quotations don't capture one.
  const [quotationPrefill, setQuotationPrefill] = useState(null)
  useEffect(() => {
    const doc = location.state?.fromQuotation
    if (doc) {
      setQuotationPrefill({ customerName: doc.customer_name, customerPhone: doc.customer_phone, items: doc.items, quotationId: doc.id })
      setShowNew(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['jobCards', tenant.id], () => fetchJobCards(tenant.id), { onData: setJobCards })
    loadWithOfflineCache(['customers', tenant.id], () => fetchCustomers(tenant.id), { onData: setCustomers })
    fetchTechnicians(tenant.id).then(setTechnicians).catch(() => {})
    fetchProducts(tenant.id).then(setProducts).catch(() => {})
  }
  useEffect(load, [tenant?.id])

  const filtered = useMemo(() => {
    if (filter === 'active') return jobCards.filter((j) => ['open', 'in_progress'].includes(j.status))
    if (filter === 'all') return jobCards
    return jobCards.filter((j) => j.status === filter)
  }, [jobCards, filter])

  const exportRows = useMemo(() => filtered.map((jc) => ({
    job_card_no: jc.job_card_no,
    customer: jc.customers?.name || '',
    vehicle: [jc.vehicles?.make, jc.vehicles?.model, jc.vehicles?.reg_number].filter(Boolean).join(' '),
    status: STATUS_META[jc.status]?.label || jc.status,
    total: formatCurrency(jc.total),
  })), [filtered])

  const advanceStatus = async (jc, status) => {
    try {
      await updateJobCard(jc.id, { status })
      toast.success(`Job card marked ${STATUS_META[status].label}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to update job card')
    }
  }

  // "Complete & Issue Receipt" -- loads the job card's parts/labor lines into
  // the same cart POS uses, then sends the cashier to POS to take payment.
  // POS.jsx finishes the loop: after checkout succeeds it marks this job
  // card completed and links it to the resulting order (see cart.sourceJobCardId).
  const issueReceipt = (jc) => {
    cart.clearCart()
    for (const item of jc.items || []) {
      cart.addItem({
        id: item.product_id || `jc-${jc.id}-${item.description}`,
        name: item.description,
        price: Number(item.unit_price) || 0,
        stock: item.product_id ? undefined : 999,
        sku: null,
      })
      if ((item.qty || 1) > 1) cart.updateQuantity(item.product_id || `jc-${jc.id}-${item.description}`, item.qty)
    }
    useCartStore.setState({ sourceJobCardId: jc.id })
    toast('Job card loaded into POS — take payment to finish', { icon: '🧾' })
    navigate('/app/pos')
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Job Cards</h1>
          <p className="text-sm text-slate-500">Customer comes in → job card → work → receipt</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={exportRows} columns={exportColumns} title="Job Cards" filename="job_cards" />
          <Button variant="workshop" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> New Job Card</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {[{ key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' }].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f.key ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <Wrench className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No job cards here</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((jc) => {
            const meta = STATUS_META[jc.status] || STATUS_META.open
            return (
              <div key={jc.id} className={`rounded-2xl border p-4 ${meta.bg} border-transparent`}>
                <div className="mb-2 flex items-start justify-between">
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{jc.job_card_no}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${meta.bg} ${meta.text}`}>{meta.label}</span>
                    {jc.status !== 'completed' && (
                      <button onClick={() => setEditingCard(jc)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mb-1 flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <User className="h-3.5 w-3.5 text-slate-400" /> {jc.customers?.name || 'Unknown'}
                </div>
                <div className="mb-2 flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <Car className="h-3.5 w-3.5 text-slate-400" /> {[jc.vehicles?.make, jc.vehicles?.model, jc.vehicles?.reg_number].filter(Boolean).join(' ') || '—'}
                </div>
                {jc.technicians?.name && <p className="mb-1 text-xs text-slate-500">Mechanic: {jc.technicians.name}</p>}
                {jc.description && <p className="mb-2 text-xs text-slate-500">{jc.description}</p>}
                <p className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(jc.total)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {jc.status === 'open' && (
                    <button onClick={() => advanceStatus(jc, 'in_progress')} className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300">Start Work</button>
                  )}
                  {(jc.status === 'open' || jc.status === 'in_progress') && (
                    <button onClick={() => issueReceipt(jc)} className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                      <Receipt className="h-3 w-3" /> {jc.status === 'in_progress' ? 'Complete & Issue Receipt' : 'Issue Receipt'}
                    </button>
                  )}
                  {jc.status === 'completed' && jc.linked_order_id && (
                    <span className="text-xs text-slate-500">Order recorded ✓</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <JobCardModal
          tenant={tenant}
          branch={branch}
          customers={customers}
          technicians={technicians}
          products={products}
          existing={null}
          prefill={quotationPrefill}
          onClose={() => { setShowNew(false); setQuotationPrefill(null) }}
          onSaved={() => { setShowNew(false); setQuotationPrefill(null); load() }}
        />
      )}
      {editingCard && (
        <JobCardModal
          tenant={tenant}
          branch={branch}
          customers={customers}
          technicians={technicians}
          products={products}
          existing={editingCard}
          onClose={() => setEditingCard(null)}
          onSaved={() => { setEditingCard(null); load() }}
        />
      )}
    </div>
  )
}

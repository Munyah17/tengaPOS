import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, RefreshCw, Search, Pencil, Trash2, Car, FileBarChart, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer, fetchInsurers } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

const BLANK = { name: '', phone: '', email: '', address: '', notes: '', medicalAidProvider: '', medicalAidNumber: '', insurerId: '' }

export default function Customers() {
  const { tenant } = useAuthStore()
  const { posMode } = useThemeStore()
  const isPharmacy = posMode === 'pharmacy'
  const [customers, setCustomers] = useState([])
  const [insurers, setInsurers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // customer row while editing, or {} for new
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['customers', tenant.id], () => fetchCustomers(tenant.id), {
      onData: setCustomers,
      onError: (err) => toast.error(err.message || 'Failed to load customers'),
      onLoadingChange: setLoading,
    })
  }

  useEffect(() => { load() }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id || !isPharmacy) return
    fetchInsurers(tenant.id).then(setInsurers).catch(() => {})
  }, [tenant?.id, isPharmacy])

  useEffect(() => {
    window.addEventListener('tengapos:force-refresh', load)
    return () => window.removeEventListener('tengapos:force-refresh', load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  const openAdd = () => { setForm(BLANK); setEditing({}) }
  const openEdit = (c) => {
    setForm({
      name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '',
      medicalAidProvider: c.medical_aid_provider || '', medicalAidNumber: c.medical_aid_number || '', insurerId: c.insurer_id || '',
    })
    setEditing(c)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateCustomer(editing.id, form)
        setCustomers((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c))
        toast.success('Customer updated')
      } else {
        const created = await createCustomer(tenant.id, form)
        setCustomers((prev) => [...prev, { ...created, vehicles: [] }].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Customer added')
      }
      setEditing(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Remove ${c.name}? This won't affect their existing invoices or job cards.`)) return
    setDeletingId(c.id)
    try {
      await deleteCustomer(c.id)
      setCustomers((prev) => prev.filter((x) => x.id !== c.id))
      toast.success(`${c.name} removed`)
    } catch (err) {
      toast.error(err.message || 'Failed to remove customer')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q))
  }, [customers, search])

  // A standalone customer database is Accounting & ERP tier, not core POS --
  // basic Invoicing/Quotations still work without it (findOrCreateCustomer
  // there isn't gated), tenants just don't get this dedicated management
  // page unless they're on the add-on.
  if (tenant?.features?.accounting_erp !== true) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Customers</h1>
          <p className="text-sm text-slate-500">Your customer database</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">Customers isn't active yet</h4>
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
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Customers</h1>
          <p className="text-sm text-slate-500">Your customer database — reused automatically on quotes, invoices, and job cards</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="primary" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading customers…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Phone', 'Email', 'Address', 'Vehicles', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    {customers.length === 0 ? 'No customers yet — add your first one, or they\'ll build up automatically from quotes and invoices.' : 'No customers match your search.'}
                  </td></tr>
                ) : filtered.map((c) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{c.address || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {c.vehicles?.length ? (
                        <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {c.vehicles.length}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/app/statements?customer=${c.id}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="View statement"
                        >
                          <FileBarChart className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Edit customer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={deletingId === c.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                          title="Remove customer"
                        >
                          {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add Customer'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {isPharmacy && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Medical Aid</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.medicalAidProvider}
                  onChange={(e) => setForm((f) => ({ ...f, medicalAidProvider: e.target.value }))}
                  placeholder="Provider"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <input
                  value={form.medicalAidNumber}
                  onChange={(e) => setForm((f) => ({ ...f, medicalAidNumber: e.target.value }))}
                  placeholder="Member No."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <select
                value={form.insurerId}
                onChange={(e) => setForm((f) => ({ ...f, insurerId: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">— No insurer linked —</option>
                {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">
            {saving ? 'Saving…' : editing?.id ? 'Save Changes' : 'Add Customer'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

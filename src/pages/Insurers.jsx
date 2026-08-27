import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Building2, Plus, RefreshCw, Search, Pencil, Trash2, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchInsurers, createInsurer, updateInsurer, deleteInsurer } from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK = { name: '', phone: '', email: '', claimsContactName: '', claimsContactPhone: '', claimsContactEmail: '', memberVerificationPhone: '', notes: '' }

export default function Insurers() {
  const { tenant } = useAuthStore()
  const [insurers, setInsurers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchInsurers(tenant.id).then(setInsurers).catch((err) => toast.error(err.message || 'Failed to load insurers')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const openAdd = () => { setForm(BLANK); setEditing({}) }
  const openEdit = (i) => {
    setForm({
      name: i.name || '', phone: i.phone || '', email: i.email || '',
      claimsContactName: i.claims_contact_name || '', claimsContactPhone: i.claims_contact_phone || '', claimsContactEmail: i.claims_contact_email || '',
      memberVerificationPhone: i.member_verification_phone || '', notes: i.notes || '',
    })
    setEditing(i)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateInsurer(editing.id, form)
        setInsurers((prev) => prev.map((i) => i.id === updated.id ? updated : i))
        toast.success('Insurer updated')
      } else {
        const created = await createInsurer(tenant.id, form)
        setInsurers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Insurer added')
      }
      setEditing(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save insurer')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (i) => {
    if (!window.confirm(`Remove ${i.name}?`)) return
    setDeletingId(i.id)
    try {
      await deleteInsurer(i.id)
      setInsurers((prev) => prev.filter((x) => x.id !== i.id))
      toast.success(`${i.name} removed`)
    } catch (err) {
      toast.error(err.message || 'Failed to remove insurer')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return insurers
    return insurers.filter((i) => i.name?.toLowerCase().includes(q) || i.phone?.toLowerCase().includes(q))
  }, [insurers, search])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Building2 className="h-5 w-5 text-brand-600" /> Insurers
          </h1>
          <p className="text-sm text-slate-500">Medical aid / insurer contacts — quick reference for claim and member verification calls.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="primary" onClick={openAdd}><Plus className="h-4 w-4" /> Add Insurer</Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search insurers…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Claims Contact', 'Member Verification', 'Phone', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">{insurers.length === 0 ? 'No insurers on file yet.' : 'No insurers match your search.'}</td></tr>
                ) : filtered.map((i) => (
                  <motion.tr key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{i.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {i.claims_contact_name || i.claims_contact_phone ? `${i.claims_contact_name || ''}${i.claims_contact_name && i.claims_contact_phone ? ' — ' : ''}${i.claims_contact_phone || ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{i.member_verification_phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{i.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(i)} disabled={deletingId === i.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40">
                          {deletingId === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'Add Insurer'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Claims Contact</p>
            <div className="space-y-2">
              <input value={form.claimsContactName} onChange={(e) => setForm((f) => ({ ...f, claimsContactName: e.target.value }))} placeholder="Contact name" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.claimsContactPhone} onChange={(e) => setForm((f) => ({ ...f, claimsContactPhone: e.target.value }))} placeholder="Phone" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                <input type="email" value={form.claimsContactEmail} onChange={(e) => setForm((f) => ({ ...f, claimsContactEmail: e.target.value }))} placeholder="Email" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Member Verification Phone</label>
            <input value={form.memberVerificationPhone} onChange={(e) => setForm((f) => ({ ...f, memberVerificationPhone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : editing?.id ? 'Save Changes' : 'Add Insurer'}</Button>
        </form>
      </Modal>
    </div>
  )
}

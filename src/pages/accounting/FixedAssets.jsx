import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchFixedAssets, createFixedAsset, deleteFixedAsset } from '@/lib/db'
import { formatCurrency, formatDate } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK = { name: '', category: '', assetType: 'fixed', purchaseDate: new Date().toISOString().slice(0, 10), cost: '', salvageValue: '0', usefulLifeYears: '5', custodian: '', location: '' }

// Straight-line depreciation: accumulated = min(annual * yearsElapsed, cost - salvage)
function bookValue(asset) {
  const cost = Number(asset.cost)
  const salvage = Number(asset.salvage_value) || 0
  const life = Number(asset.useful_life_years)
  const yearsElapsed = (Date.now() - new Date(asset.purchase_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  const annual = (cost - salvage) / life
  const accumulated = Math.min(annual * Math.max(yearsElapsed, 0), cost - salvage)
  return { bookValue: cost - accumulated, accumulated, annual }
}

export default function FixedAssets() {
  const { tenant } = useAuthStore()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchFixedAssets(tenant.id).then(setAssets).catch((err) => toast.error(err.message || 'Failed to load assets')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    const cost = Number(form.cost)
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!cost || cost < 0) { toast.error('Enter a valid cost'); return }
    setSaving(true)
    try {
      const created = await createFixedAsset(tenant.id, undefined, { ...form, cost, salvageValue: Number(form.salvageValue) || 0, usefulLifeYears: Number(form.usefulLifeYears) })
      setAssets((prev) => [created, ...prev])
      toast.success('Asset added')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`Remove ${a.name}?`)) return
    setDeletingId(a.id)
    try {
      await deleteFixedAsset(a.id)
      setAssets((prev) => prev.filter((x) => x.id !== a.id))
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Assets & Depreciation</h2>
          <p className="text-sm text-slate-500">Straight-line depreciation, computed live</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Asset</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No assets recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Type', 'Purchased', 'Cost', 'Annual Dep.', 'Book Value', ''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const { bookValue: bv, annual } = bookValue(a)
                  return (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{a.name}<span className="ml-1 text-xs text-slate-400">{a.category}</span></td>
                      <td className="px-4 py-3 text-sm capitalize text-slate-600 dark:text-slate-400">{a.asset_type}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(a.purchase_date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{fmt(a.cost)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{fmt(annual)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(bv)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(a)} disabled={deletingId === a.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950">
                          {deletingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Asset">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
              <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Vehicle, Equipment" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
              <select value={form.assetType} onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="fixed">Fixed</option>
                <option value="moving">Moving</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Date</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cost</label>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Salvage Value</label>
              <input type="number" min="0" step="0.01" value={form.salvageValue} onChange={(e) => setForm((f) => ({ ...f, salvageValue: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Useful Life (years)</label>
              <input type="number" min="1" step="1" value={form.usefulLifeYears} onChange={(e) => setForm((f) => ({ ...f, usefulLifeYears: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Custodian</label>
              <input value={form.custodian} onChange={(e) => setForm((f) => ({ ...f, custodian: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Location</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Add Asset'}</Button>
        </form>
      </Modal>
    </div>
  )
}

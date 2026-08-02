import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Plus, Trash2, Info } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchCashTransactions, fetchFixedAssets, fetchDocuments, fetchAllInvoicePaymentsForTenant,
  fetchCreditorBills, fetchAllCreditorPaymentsForTenant, fetchOtherLiabilities, createOtherLiability, deleteOtherLiability,
  fetchEquityEntries, createEquityEntry, deleteEquityEntry,
} from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import toast from 'react-hot-toast'

function assetBookValue(asset) {
  const cost = Number(asset.cost)
  const salvage = Number(asset.salvage_value) || 0
  const life = Number(asset.useful_life_years)
  const yearsElapsed = (Date.now() - new Date(asset.purchase_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  const annual = (cost - salvage) / life
  const accumulated = Math.min(annual * Math.max(yearsElapsed, 0), cost - salvage)
  return cost - accumulated
}

function EntryList({ title, entries, currency, onAdd, onDelete }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const fmt = (n) => formatCurrency(n, currency)
  const submit = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!description.trim() || !amt) { toast.error('Enter a description and amount'); return }
    await onAdd({ description, amount: amt })
    setDescription(''); setAmount('')
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <div className="mb-3 space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400">None yet.</p>
        ) : entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">{e.description}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">{fmt(e.amount)}</span>
              <button onClick={() => onDelete(e.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-1.5">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-24 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <button type="submit" className="flex-shrink-0 rounded-lg bg-brand-600 p-1.5 text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" /></button>
      </form>
    </div>
  )
}

export default function BalanceSheet() {
  const { tenant, user } = useAuthStore()
  const [cash, setCash] = useState(0)
  const [assetsNetValue, setAssetsNetValue] = useState(0)
  const [debtorsTotal, setDebtorsTotal] = useState(0)
  const [creditorsTotal, setCreditorsTotal] = useState(0)
  const [otherLiabilities, setOtherLiabilities] = useState([])
  const [equityEntries, setEquityEntries] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([
      fetchCashTransactions(tenant.id),
      fetchFixedAssets(tenant.id),
      fetchDocuments(tenant.id, 'invoice'),
      fetchAllInvoicePaymentsForTenant(tenant.id),
      fetchCreditorBills(tenant.id),
      fetchAllCreditorPaymentsForTenant(tenant.id),
      fetchOtherLiabilities(tenant.id),
      fetchEquityEntries(tenant.id),
    ]).then(([cashTxns, assets, docs, payments, bills, billPayments, liabilities, equity]) => {
      setCash(cashTxns.reduce((s, t) => t.type === 'deposit' ? s + Number(t.amount) : t.type === 'withdrawal' ? s - Number(t.amount) : s, 0))
      setAssetsNetValue(assets.filter((a) => !a.disposed_at).reduce((s, a) => s + assetBookValue(a), 0))

      const paidByDoc = new Map()
      for (const p of payments) paidByDoc.set(p.document_id, (paidByDoc.get(p.document_id) || 0) + Number(p.amount))
      setDebtorsTotal(docs.reduce((s, d) => s + Math.max(0, Number(d.total) - (paidByDoc.get(d.id) || 0)), 0))

      const paidByBill = new Map()
      for (const p of billPayments) paidByBill.set(p.creditor_bill_id, (paidByBill.get(p.creditor_bill_id) || 0) + Number(p.amount))
      const payable = bills.filter((b) => b.status !== 'cancelled')
      setCreditorsTotal(payable.reduce((s, b) => s + Math.max(0, Number(b.amount) - (paidByBill.get(b.id) || 0)), 0))

      setOtherLiabilities(liabilities)
      setEquityEntries(equity)
    }).catch((err) => toast.error(err.message || 'Failed to load balance sheet')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const otherLiabilitiesTotal = useMemo(() => otherLiabilities.reduce((s, l) => s + Number(l.amount), 0), [otherLiabilities])
  const equityTotal = useMemo(() => equityEntries.reduce((s, e) => s + Number(e.amount), 0), [equityEntries])
  const totalAssets = cash + assetsNetValue + debtorsTotal
  const totalLiabilities = creditorsTotal + otherLiabilitiesTotal
  const balanced = Math.abs(totalAssets - (totalLiabilities + equityTotal)) < 0.01

  const addLiability = async ({ description, amount }) => {
    const created = await createOtherLiability(tenant.id, user?.id, { description, amount })
    setOtherLiabilities((prev) => [created, ...prev])
  }
  const removeLiability = async (id) => { await deleteOtherLiability(id); setOtherLiabilities((prev) => prev.filter((l) => l.id !== id)) }
  const addEquity = async ({ description, amount }) => {
    const created = await createEquityEntry(tenant.id, user?.id, { description, amount })
    setEquityEntries((prev) => [created, ...prev])
  }
  const removeEquity = async (id) => { await deleteEquityEntry(id); setEquityEntries((prev) => prev.filter((e) => e.id !== id)) }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Balance Sheet / Statement of Financial Position</h2>
          <p className="text-sm text-slate-500">Best-effort summary compiled from other modules — not an audited financial statement</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Assets</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Cash (Hand + Bank)</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(cash)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Fixed Assets (net book value)</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(assetsNetValue)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Debtors (Accounts Receivable)</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(debtorsTotal)}</span></div>
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:text-white"><span>Total Assets</span><span>{fmt(totalAssets)}</span></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Liabilities</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Creditors (Accounts Payable)</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(creditorsTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Other Liabilities</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(otherLiabilitiesTotal)}</span></div>
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:text-white"><span>Total Liabilities</span><span>{fmt(totalLiabilities)}</span></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Equity</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Owner's Equity / Capital</span><span className="font-semibold text-slate-900 dark:text-white">{fmt(equityTotal)}</span></div>
          </div>
          <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:text-white"><span>Total Equity</span><span>{fmt(equityTotal)}</span></div>
        </div>
      </div>

      <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${balanced ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800/50 dark:bg-green-900/20 dark:text-green-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300'}`}>
        <Info className="h-4 w-4 flex-shrink-0" />
        Assets ({fmt(totalAssets)}) {balanced ? '=' : '≠'} Liabilities + Equity ({fmt(totalLiabilities + equityTotal)}) — {balanced ? 'in balance' : 'add Equity entries below to bring this into balance; this is expected until Equity reflects your actual capital position'}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <EntryList title="Other Liabilities (e.g. loans)" entries={otherLiabilities} currency={tenant?.currency} onAdd={addLiability} onDelete={removeLiability} />
        <EntryList title="Equity Entries (e.g. owner's capital)" entries={equityEntries} currency={tenant?.currency} onAdd={addEquity} onDelete={removeEquity} />
      </div>
    </div>
  )
}

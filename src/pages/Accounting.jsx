import { useState } from 'react'
import {
  Truck, Receipt, Wallet, Banknote, ClipboardList, ArrowDownUp, Users,
  FileMinus, Landmark, Ruler, PackageCheck, Scale, BookOpen, TrendingUp, Building2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

import Suppliers from '@/pages/accounting/Suppliers'
import Expenses from '@/pages/accounting/Expenses'
import PettyCash from '@/pages/accounting/PettyCash'
import CashManagement from '@/pages/accounting/CashManagement'
import Requisitions from '@/pages/accounting/Requisitions'
import Creditors from '@/pages/accounting/Creditors'
import Debtors from '@/pages/accounting/Debtors'
import CreditDebitNotes from '@/pages/accounting/CreditDebitNotes'
import FixedAssets from '@/pages/accounting/FixedAssets'
import Boq from '@/pages/accounting/Boq'
import ReleaseNotes from '@/pages/accounting/ReleaseNotes'
import Reconciliation from '@/pages/accounting/Reconciliation'
import Ledger from '@/pages/accounting/Ledger'
import FinancialReports from '@/pages/accounting/FinancialReports'
import BalanceSheet from '@/pages/accounting/BalanceSheet'

const SECTIONS = [
  { id: 'financial_reports', label: 'Financial Reports', icon: TrendingUp, Component: FinancialReports },
  { id: 'ledger', label: 'Ledger', icon: BookOpen, Component: Ledger },
  { id: 'balance_sheet', label: 'Balance Sheet / SOFP', icon: Scale, Component: BalanceSheet },
  { id: 'expenses', label: 'Expenses', icon: Receipt, Component: Expenses },
  { id: 'petty_cash', label: 'Petty Cash', icon: Wallet, Component: PettyCash },
  { id: 'cash_management', label: 'Cash Management', icon: Banknote, Component: CashManagement },
  { id: 'requisitions', label: 'Requisitions', icon: ClipboardList, Component: Requisitions },
  { id: 'creditors', label: 'Creditors', icon: ArrowDownUp, Component: Creditors },
  { id: 'debtors', label: 'Debtors', icon: Users, Component: Debtors },
  { id: 'credit_debit_notes', label: 'Credit / Debit Notes', icon: FileMinus, Component: CreditDebitNotes },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, Component: Suppliers },
  { id: 'fixed_assets', label: 'Assets & Depreciation', icon: Building2, Component: FixedAssets },
  { id: 'boq', label: 'Bill of Quantities', icon: Ruler, Component: Boq },
  { id: 'release_notes', label: 'Release Notes', icon: PackageCheck, Component: ReleaseNotes },
  { id: 'reconciliation', label: 'Bank Reconciliation', icon: Landmark, Component: Reconciliation },
]

export default function Accounting() {
  const { tenant } = useAuthStore()
  const [activeSection, setActiveSection] = useState('financial_reports')
  const erpUnlocked = tenant?.features?.accounting_erp === true

  if (!erpUnlocked) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Accounting</h1>
          <p className="text-sm text-slate-500">Bookkeeping and financial management</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">Accounting isn't active yet</h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is part of the Accounting & ERP add-on ($5/month, or $13/quarter, $24/6 months, $45/year). Request it from Settings and it'll unlock here once approved.
          </p>
        </div>
      </div>
    )
  }

  const Active = SECTIONS.find((s) => s.id === activeSection)?.Component || FinancialReports

  return (
    <div className="flex h-full flex-col sm:flex-row">
      {/* Section nav — mobile: horizontal scroll strip; desktop: left rail */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800 sm:w-56 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors sm:flex-shrink ${
              activeSection === s.id
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <s.icon className="h-4 w-4 flex-shrink-0" />
            <span className="whitespace-nowrap">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <Active />
      </div>
    </div>
  )
}

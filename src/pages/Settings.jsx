import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon, Store, CreditCard, Receipt,
  Bell, Shield, Palette, Globe, ExternalLink, Cpu,
  CheckCircle, AlertTriangle, Loader, Power, PowerOff, Eye, EyeOff,
} from 'lucide-react'
import Button from '@/components/common/Button'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useThemeStore } from '@/stores/themeStore'
import { useFiscalStore } from '@/stores/fiscalStore'
import { pingDevice } from '@/lib/fiscalApi'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useReceiptConfigStore } from '@/stores/receiptConfigStore'
import { useFiscalPricing } from '@/lib/platformSettings'
import { CURRENCIES, PAYMENT_PROVIDERS } from '@/utils/constants'
import {
  fetchAllTenantData, fetchBranches, fetchReceiptConfigs,
  submitReceiptConfig, approveReceiptConfig, rejectReceiptConfig,
} from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { PAPER_SIZES, PRINTER_CONNECTIONS } from '@/lib/posPrinter'
import { Download, Clock, Printer } from 'lucide-react'
import toast from 'react-hot-toast'

const sections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'store', label: 'Receipts Config', icon: Printer },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'fiscalisation', label: 'ZIMRA Fiscal', icon: Cpu },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'whitelabel', label: 'White Label', icon: Globe },
]

// Shop managers run day-to-day operations but don't own the business —
// payment gateway credentials, ZIMRA fiscal device registration, and the
// account-security/data-export tools stay Vendor-only.
const SHOP_MANAGER_HIDDEN_SECTIONS = ['payments', 'fiscalisation', 'security']

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general')
  const { posMode, setPosMode } = useThemeStore()
  const { tenant, role, branch: homeBranch, initAuth } = useAuthStore()
  const fiscal = useFiscalStore()
  const visibleSections = role === 'shop_manager'
    ? sections.filter((s) => !SHOP_MANAGER_HIDDEN_SECTIONS.includes(s.id))
    : sections

  useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeSection)) setActiveSection('general')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  // ─── Receipts Config: real, persisted receipt branding/paper/template ───
  const RECEIPT_TEMPLATES = [
    { key: 'zimra_default', label: 'ZIMRA Default Receipt', hint: 'Standard ZIMRA-format receipt — no customisation.' },
    { key: 'zimra_customized', label: 'ZIMRA + Customisation', hint: 'ZIMRA format, with your own store info and footer message.' },
    { key: 'fully_customized', label: 'Fully Customized Receipt', hint: 'Your own layout — hides the ZIMRA fiscal section even if fiscalisation is active.' },
  ]
  const [branches, setBranches] = useState([])
  const [receiptConfigs, setReceiptConfigs] = useState([])
  const [scopeBranchId, setScopeBranchId] = useState(role === 'shop_manager' ? (homeBranch?.id || '') : '')
  const [receiptForm, setReceiptForm] = useState({
    templateMode: 'zimra_default', storeName: '', storeAddress: '', storeContacts: '',
    tin: '', vatNumber: '', footerMessage: '', paperWidthMm: 80, printerConnection: 'usb',
    showPosPrint: true,
  })
  const [savingReceiptConfig, setSavingReceiptConfig] = useState(false)

  const loadReceiptConfigs = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['receiptConfigs', tenant.id], () => fetchReceiptConfigs(tenant.id), {
      onData: setReceiptConfigs,
    })
  }
  useEffect(loadReceiptConfigs, [tenant?.id])
  useEffect(() => {
    if (!tenant?.id) return
    fetchBranches(tenant.id).then(setBranches).catch(() => {})
  }, [tenant?.id])

  // Populate the form from whatever config already exists for the selected
  // scope (tenant default, or a specific branch) — blank/defaults otherwise.
  useEffect(() => {
    const existing = receiptConfigs.find((c) => (c.branch_id || '') === (scopeBranchId || ''))
    setReceiptForm({
      templateMode: existing?.template_mode || 'zimra_default',
      storeName: existing?.store_name || '',
      storeAddress: existing?.store_address || '',
      storeContacts: existing?.store_contacts || '',
      tin: existing?.tin || '',
      vatNumber: existing?.vat_number || '',
      footerMessage: existing?.footer_message || '',
      paperWidthMm: existing?.paper_width_mm || 80,
      printerConnection: existing?.printer_connection || 'usb',
      showPosPrint: existing?.show_pos_print !== false,
    })
  }, [scopeBranchId, receiptConfigs])

  const handleSaveReceiptConfig = async () => {
    setSavingReceiptConfig(true)
    try {
      await submitReceiptConfig({ ...receiptForm, branchId: scopeBranchId || null })
      toast.success(
        role === 'shop_manager'
          ? 'Submitted — awaiting the business owner\'s approval'
          : 'Receipt config saved',
      )
      loadReceiptConfigs()
    } catch (err) {
      toast.error(err.message || 'Failed to save receipt config')
    } finally {
      setSavingReceiptConfig(false)
    }
  }

  const handleApproveReceiptConfig = async (id) => {
    try {
      await approveReceiptConfig(id)
      toast.success('Approved')
      loadReceiptConfigs()
    } catch (err) {
      toast.error(err.message || 'Failed to approve')
    }
  }

  const handleRejectReceiptConfig = async (id) => {
    try {
      await rejectReceiptConfig(id)
      toast.success('Rejected')
      loadReceiptConfigs()
    } catch (err) {
      toast.error(err.message || 'Failed to reject')
    }
  }

  const pendingConfigs = receiptConfigs.filter((c) => c.pending_approval)

  // ─── Fiscalisation add-on subscription ───
  const fiscalPricing = useFiscalPricing()
  const fiscalUnlocked = tenant?.features?.fiscalisation === true
  const [fiscalPeriod, setFiscalPeriod] = useState('monthly')
  const [fiscalPayMethod, setFiscalPayMethod] = useState('paynow')
  const [fiscalRequesting, setFiscalRequesting] = useState(false)
  const [pendingFiscalRequest, setPendingFiscalRequest] = useState(null)

  const loadPendingFiscalRequest = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(
      ['pendingFiscalRequest', tenant.id],
      () => supabase
        .from('fiscalisation_requests')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => { if (error) throw error; return data }),
      { onData: setPendingFiscalRequest },
    )
  }
  useEffect(loadPendingFiscalRequest, [tenant?.id])

  const requestFiscalisation = async () => {
    setFiscalRequesting(true)
    try {
      const price = fiscalPricing[fiscalPeriod]?.price
      if (fiscalPayMethod === 'cash') {
        // Cash: goes to the operations team for approval
        const { error } = await supabase.from('fiscalisation_requests').insert({
          tenant_id: tenant.id,
          period: fiscalPeriod,
          method: 'cash',
          amount: price,
        })
        if (error) throw error
        toast.success('Request sent! Our team will confirm your cash payment and activate fiscalisation.')
        setPendingFiscalRequest({ status: 'pending', period: fiscalPeriod, method: 'cash' })
      } else {
        // Online: hosted checkout (Stripe or Paynow), webhook unlocks the feature
        const { data: { session } } = await supabase.auth.getSession()
        const { data, error } = await supabase.functions.invoke('signup-checkout', {
          body: {
            type: 'fiscalisation',
            period: fiscalPeriod,
            provider: fiscalPayMethod,
            return_url: `${window.location.origin}/app/settings`,
          },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (error) {
          let msg = error.message
          try {
            const ctx = await error.context?.json()
            if (ctx?.error) msg = ctx.error
          } catch { /* keep default */ }
          throw new Error(msg)
        }
        if (data?.error) throw new Error(data.error)
        if (!data?.url) throw new Error('No checkout URL returned')
        window.location.href = data.url
        return
      }
    } catch (err) {
      toast.error(err.message || 'Could not submit request')
    } finally {
      setFiscalRequesting(false)
    }
  }

  // Paynow integration state
  const [paynowId, setPaynowId] = useState('')
  const [paynowKey, setPaynowKey] = useState('')
  const [showPaynowKey, setShowPaynowKey] = useState(false)
  const [paynowSaving, setPaynowSaving] = useState(false)
  const [paynowConfigured, setPaynowConfigured] = useState(false)

  const loadPaynowConfig = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(
      ['paynowConfig', tenant.id],
      () => supabase
        .from('tenants')
        .select('paynow_integration_id, paynow_integration_key')
        .eq('id', tenant.id)
        .single()
        .then(({ data, error }) => { if (error) throw error; return data }),
      {
        onData: (data) => {
          if (data?.paynow_integration_id) {
            setPaynowId(data.paynow_integration_id)
            setPaynowKey(data.paynow_integration_key || '')
            setPaynowConfigured(true)
          }
        },
      },
    )
  }
  useEffect(loadPaynowConfig, [tenant?.id])

  const handleSavePaynow = async () => {
    if (!paynowId.trim() || !paynowKey.trim()) {
      toast.error('Both Integration ID and Integration Key are required')
      return
    }
    setPaynowSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ paynow_integration_id: paynowId.trim(), paynow_integration_key: paynowKey.trim() })
        .eq('id', tenant.id)
      if (error) throw error
      setPaynowConfigured(true)
      toast.success('Paynow credentials saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save Paynow settings')
    } finally {
      setPaynowSaving(false)
    }
  }

  // Stripe integration state — tenant's own keys, mirrors the Paynow card
  const [stripePubKey, setStripePubKey] = useState('')
  const [stripeSecretKey, setStripeSecretKey] = useState('')
  const [showStripeKey, setShowStripeKey] = useState(false)
  const [stripeSaving, setStripeSaving] = useState(false)
  const [stripeConfigured, setStripeConfigured] = useState(false)

  const loadStripeConfig = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(
      ['stripeConfig', tenant.id],
      () => supabase
        .from('tenants')
        .select('stripe_publishable_key, stripe_secret_key')
        .eq('id', tenant.id)
        .single()
        .then(({ data, error }) => { if (error) throw error; return data }),
      {
        onData: (data) => {
          if (data?.stripe_publishable_key) {
            setStripePubKey(data.stripe_publishable_key)
            setStripeSecretKey(data.stripe_secret_key || '')
            setStripeConfigured(true)
          }
        },
      },
    )
  }
  useEffect(loadStripeConfig, [tenant?.id])

  // "Refresh Online Updates" button — reload all of this page's network data
  useEffect(() => {
    const handler = () => { loadPendingFiscalRequest(); loadPaynowConfig(); loadStripeConfig() }
    window.addEventListener('tengapos:force-refresh', handler)
    return () => window.removeEventListener('tengapos:force-refresh', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  const handleSaveStripe = async () => {
    if (!stripePubKey.trim() || !stripeSecretKey.trim()) {
      toast.error('Both Publishable Key and Secret Key are required')
      return
    }
    setStripeSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ stripe_publishable_key: stripePubKey.trim(), stripe_secret_key: stripeSecretKey.trim() })
        .eq('id', tenant.id)
      if (error) throw error
      setStripeConfigured(true)
      toast.success('Stripe credentials saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save Stripe settings')
    } finally {
      setStripeSaving(false)
    }
  }

  // ─── General: business name, currency, VAT ───
  const [businessName, setBusinessName] = useState(tenant?.name || '')
  const [currency, setCurrency] = useState(tenant?.currency || 'USD')
  const [vatEnabled, setVatEnabledLocal] = useState(tenant?.vat_enabled !== false)
  const [vatRate, setVatRate] = useState(tenant?.vat_rate ?? 15.5)
  const [generalSaving, setGeneralSaving] = useState(false)

  useEffect(() => {
    if (tenant) {
      setBusinessName(tenant.name || '')
      setCurrency(tenant.currency || 'USD')
      setVatEnabledLocal(tenant.vat_enabled !== false)
      setVatRate(tenant.vat_rate ?? 15.5)
    }
  }, [tenant])

  const handleSaveGeneral = async () => {
    setGeneralSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ name: businessName.trim(), currency, vat_enabled: vatEnabled, vat_rate: Number(vatRate) || 15.5 })
        .eq('id', tenant.id)
      if (error) throw error
      toast.success('Settings saved')
      await initAuth()
    } catch (err) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setGeneralSaving(false)
    }
  }

  // ─── Download all data ───
  const [downloadingData, setDownloadingData] = useState(false)
  const handleDownloadData = async () => {
    setDownloadingData(true)
    try {
      const data = await fetchAllTenantData(tenant.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tengapos-data-${tenant.name?.replace(/\s+/g, '-') || 'export'}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Your data has been downloaded')
    } catch (err) {
      toast.error(err.message || 'Failed to export data')
    } finally {
      setDownloadingData(false)
    }
  }

  const [fiscalForm, setFiscalForm] = useState({
    deviceID: '',
    activationKey: '',
    deviceSerialNo: '',
    deviceModelName: 'tengaPOS-v2',
    deviceModelVersionNo: '2.0.0',
    tin: '',
    vatNumber: '',
    branchName: '',
    branchAddress: '',
    branchContacts: '',
    isEnabled: false,
  })
  const [fiscalLoading, setFiscalLoading] = useState(false)
  const [fiscalSaving, setFiscalSaving] = useState(false)
  const [pingLoading, setPingLoading] = useState(false)

  // Load fiscal config from DB on mount (multi-tenant: each vendor has their own row)
  useEffect(() => {
    if (!tenant?.id) return
    setFiscalLoading(true)
    supabase
      .from('tenant_fiscal_configs')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const row = {
            deviceID: data.device_id || '',
            activationKey: data.activation_key || '',
            deviceSerialNo: data.device_serial_no || '',
            deviceModelName: data.device_model_name || 'tengaPOS-v2',
            deviceModelVersionNo: data.device_model_version_no || '2.0.0',
            tin: data.tin || '',
            vatNumber: data.vat_number || '',
            branchName: data.branch_name || '',
            branchAddress: data.branch_address || '',
            branchContacts: data.branch_contacts || '',
            isEnabled: data.is_enabled ?? false,
          }
          setFiscalForm(row)
          fiscal.loadFromDB(data)
        }
      })
      .finally(() => setFiscalLoading(false))
  }, [tenant?.id])

  const handleFiscalSave = async () => {
    if (!tenant?.id) return
    setFiscalSaving(true)
    try {
      const upsertData = {
        tenant_id:              tenant.id,
        device_id:              fiscalForm.deviceID.trim(),
        activation_key:         fiscalForm.activationKey.trim(),
        device_serial_no:       fiscalForm.deviceSerialNo.trim(),
        device_model_name:      fiscalForm.deviceModelName.trim(),
        device_model_version_no: fiscalForm.deviceModelVersionNo.trim(),
        tin:                    fiscalForm.tin.trim(),
        vat_number:             fiscalForm.vatNumber.trim(),
        branch_name:            fiscalForm.branchName.trim(),
        branch_address:         fiscalForm.branchAddress.trim(),
        branch_contacts:        fiscalForm.branchContacts.trim(),
        is_enabled:             fiscalForm.isEnabled,
        updated_at:             new Date().toISOString(),
      }
      const { error } = await supabase
        .from('tenant_fiscal_configs')
        .upsert(upsertData, { onConflict: 'tenant_id' })
      if (error) throw error
      // Sync runtime store
      fiscal.setConfig({
        deviceID:             fiscalForm.deviceID,
        activationKey:        fiscalForm.activationKey,
        deviceSerialNo:       fiscalForm.deviceSerialNo,
        deviceModelName:      fiscalForm.deviceModelName,
        deviceModelVersionNo: fiscalForm.deviceModelVersionNo,
        tin:                  fiscalForm.tin,
        vatNumber:            fiscalForm.vatNumber,
        branchName:           fiscalForm.branchName,
        branchAddress:        fiscalForm.branchAddress,
        branchContacts:       fiscalForm.branchContacts,
        isEnabled:            fiscalForm.isEnabled,
      })
      toast.success('ZIMRA settings saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save ZIMRA settings')
    } finally {
      setFiscalSaving(false)
    }
  }

  const isSupabaseConfigured = !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
  )

  const handlePingDevice = async () => {
    if (!fiscalForm.isEnabled) {
      toast.error('Enable fiscalisation first')
      return
    }
    if (!fiscalForm.deviceID) {
      toast.error('Enter and save a Device ID first')
      return
    }
    if (!isSupabaseConfigured) {
      toast.error('Service not available — contact support')
      return
    }
    setPingLoading(true)
    try {
      await pingDevice({ tenantId: tenant?.id, deviceID: fiscalForm.deviceID })
      toast.success('Device reachable — connection OK')
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('not found') || msg.includes('404')) {
        toast.error('ZIMRA service unavailable — contact support')
      } else {
        toast.error('ZIMRA device unreachable — check device ID and ZIMRA FDMS status')
      }
    } finally {
      setPingLoading(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500">Manage your store configuration</p>
      </div>

      {/* Mobile: horizontal scrolling tab strip */}
      <div className="mb-4 -mx-6 flex overflow-x-auto px-6 pb-2 md:hidden">
        <div className="flex gap-1.5">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                activeSection === section.id
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <section.icon className="h-3.5 w-3.5 flex-shrink-0" />
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar — desktop only */}
        <div className="hidden w-56 flex-shrink-0 md:block">
          <div className="space-y-1">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            {activeSection === 'general' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">General Settings</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* VAT — inclusive pricing, tenant can switch off entirely */}
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">VAT (Value Added Tax)</span>
                      <p className="text-xs text-slate-500">Shelf prices already include VAT — nothing is added at checkout.</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={vatEnabled}
                        onChange={(e) => setVatEnabledLocal(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                    </label>
                  </div>
                  {/* Rate field stays visible but locked while VAT is off */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-500">VAT Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      disabled={!vatEnabled}
                      className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                    />
                  </div>
                  {!vatEnabled && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      VAT is disabled — it will never be mentioned on checkout, receipts, or reports.
                    </p>
                  )}
                </div>

                <Button onClick={handleSaveGeneral} disabled={generalSaving}>
                  {generalSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Appearance</h3>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Theme Mode</label>
                  <ThemeToggle />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">POS Mode</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPosMode('retail')}
                      className={`flex-1 rounded-xl border-2 p-4 text-center ${
                        posMode === 'retail'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="mb-2 h-3 w-full rounded bg-brand-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Retail (Blue)</span>
                    </button>
                    <button
                      onClick={() => setPosMode('restaurant')}
                      className={`flex-1 rounded-xl border-2 p-4 text-center ${
                        posMode === 'restaurant'
                          ? 'border-restaurant-500 bg-restaurant-50 dark:bg-restaurant-950'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="mb-2 h-3 w-full rounded bg-restaurant-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Restaurant (Green)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'payments' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payment Methods</h3>
                <p className="text-sm text-slate-500">Providers your store accepts payments through.</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {PAYMENT_PROVIDERS.map((p) => (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-3.5 ${
                        p.status === 'coming_soon'
                          ? 'border-slate-100 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-800/50'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</span>
                        {p.status === 'coming_soon' && (
                          <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            <Clock className="h-2.5 w-2.5" /> Coming Soon
                          </span>
                        )}
                        {p.status === 'via_paynow' && (
                          <span className="rounded-full bg-[#f7941d]/15 px-2 py-0.5 text-[10px] font-bold text-[#f7941d]">Via Paynow</span>
                        )}
                        {p.status === 'available' && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">Available</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{p.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Stripe Integration */}
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-extrabold text-sm">S</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Stripe Integration</h4>
                        {stripeConfigured && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            Configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Accept card payments worldwide via Stripe hosted checkout. Your keys are stored securely and never exposed to the client.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Publishable Key</label>
                      <input
                        type="text"
                        value={stripePubKey}
                        onChange={(e) => setStripePubKey(e.target.value)}
                        placeholder="pk_live_..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Secret Key</label>
                      <div className="relative">
                        <input
                          type={showStripeKey ? 'text' : 'password'}
                          value={stripeSecretKey}
                          onChange={(e) => setStripeSecretKey(e.target.value)}
                          placeholder="sk_live_..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowStripeKey(!showStripeKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showStripeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Get your keys from{' '}
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">dashboard.stripe.com</span>
                      {' → Developers → API keys.'}
                    </p>
                    <Button onClick={handleSaveStripe} disabled={stripeSaving}>
                      {stripeSaving ? 'Saving…' : 'Save Stripe Settings'}
                    </Button>
                  </div>
                </div>

                {/* Paynow Integration */}
                <div className="rounded-2xl border border-[#f7941d]/30 bg-[#f7941d]/5 p-5 dark:border-[#f7941d]/20 dark:bg-[#f7941d]/10">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7941d] text-white font-extrabold text-sm">PN</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Paynow Integration</h4>
                        {paynowConfigured && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            Configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Accept EcoCash, OneMoney, InnBucks and Omari via Paynow hosted checkout. Each vendor uses their own Paynow account — TengaPOS never touches payment data.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Integration ID
                      </label>
                      <input
                        type="text"
                        value={paynowId}
                        onChange={(e) => setPaynowId(e.target.value)}
                        placeholder="e.g. 12345"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Integration Key
                      </label>
                      <div className="relative">
                        <input
                          type={showPaynowKey ? 'text' : 'password'}
                          value={paynowKey}
                          onChange={(e) => setPaynowKey(e.target.value)}
                          placeholder="Your Paynow integration key"
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPaynowKey(!showPaynowKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPaynowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      Get your credentials from{' '}
                      <span className="font-semibold text-[#f7941d]">paynow.co.zw</span>
                      {' → Merchant → Integration Settings.'}
                      {' '}Keys are stored securely and never exposed to the client.
                    </p>

                    <Button
                      onClick={handleSavePaynow}
                      disabled={paynowSaving}
                      className="!bg-[#f7941d] hover:!bg-[#e0851a]"
                    >
                      {paynowSaving ? 'Saving…' : 'Save Paynow Settings'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'receipts' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Receipt Settings</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt Header</label>
                  <input
                    type="text"
                    defaultValue="Thank you for shopping with us!"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt Footer</label>
                  <input
                    type="text"
                    defaultValue="Powered by tengaPOS"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  ZIMRA Fiscalisation is managed on its own tab — see <b>ZIMRA Fiscal</b> in the sidebar.
                </p>
                <Button>Save Changes</Button>
              </div>
            )}

            {activeSection === 'fiscalisation' && (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">ZIMRA Fiscalisation</h3>
                    <p className="text-sm text-slate-500">
                      Optional add-on — issue ZIMRA-compliant receipts and file fiscal day returns.
                      From ${fiscalPricing.monthly?.price ?? 20}/month.
                    </p>
                  </div>
                  {fiscal.isRegistered && (
                    <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Registered
                    </span>
                  )}
                </div>

                {/* Add-on subscription gate */}
                {!fiscalUnlocked && (
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700/50 dark:bg-amber-900/20">
                    <h4 className="font-bold text-amber-900 dark:text-amber-200">Activate ZIMRA Fiscalisation</h4>
                    {pendingFiscalRequest ? (
                      <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                        Your cash payment request is <b>awaiting confirmation</b> by our team.
                        Fiscalisation unlocks as soon as it's approved.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                          Choose a period, pay online or by cash, and the module unlocks automatically.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {Object.entries(fiscalPricing).map(([key, p]) => (
                            <button
                              key={key}
                              onClick={() => setFiscalPeriod(key)}
                              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                fiscalPeriod === key
                                  ? 'border-amber-600 bg-white dark:bg-slate-900'
                                  : 'border-amber-200 bg-white/60 hover:border-amber-400 dark:border-amber-800/40 dark:bg-white/5'
                              }`}
                            >
                              <p className="text-lg font-extrabold text-slate-900 dark:text-white">${p.price}</p>
                              <p className="text-xs text-slate-500">{p.label}</p>
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            { key: 'paynow', label: 'Paynow · EcoCash' },
                            { key: 'stripe', label: 'Card · Stripe' },
                            { key: 'cash', label: 'Cash (approved by our team)' },
                          ].map((m) => (
                            <button
                              key={m.key}
                              onClick={() => setFiscalPayMethod(m.key)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                fiscalPayMethod === m.key
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-white text-slate-600 hover:bg-amber-100 dark:bg-white/10 dark:text-slate-300'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={requestFiscalisation}
                          disabled={fiscalRequesting}
                          className="mt-4 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60 sm:w-auto sm:px-6"
                        >
                          {fiscalRequesting
                            ? 'Processing…'
                            : fiscalPayMethod === 'cash'
                              ? `Request Fiscalisation — $${fiscalPricing[fiscalPeriod]?.price} cash`
                              : `Request Fiscalisation — pay $${fiscalPricing[fiscalPeriod]?.price} now`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {fiscalUnlocked && tenant?.fiscal_expires_at && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800/50 dark:bg-green-900/20 dark:text-green-300">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Fiscalisation add-on active until {new Date(tenant.fiscal_expires_at).toLocaleDateString('en-GB')}
                  </div>
                )}

                {/* Enable toggle */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Enable Fiscalisation</span>
                    <p className="text-xs text-slate-500">
                      {fiscalForm.isEnabled
                        ? 'Receipts will be submitted to ZIMRA FDMS on each sale'
                        : 'Disabled — ZIMRA is never mentioned on your receipts, and the fields below are locked until you enable it'}
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={fiscalForm.isEnabled}
                      onChange={(e) => setFiscalForm(f => ({ ...f, isEnabled: e.target.checked }))}
                      className="peer sr-only"
                    />
                    <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                  </label>
                </div>

                {/* Fiscal day status */}
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Fiscal Day Status</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      fiscal.fiscalDayStatus === 'FiscalDayOpened'
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                        : fiscal.fiscalDayStatus === 'FiscalDayClosed'
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                    }`}>
                      {fiscal.fiscalDayStatus}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">Day No: {fiscal.fiscalDayNo} &nbsp;|&nbsp; Last Receipt No: {fiscal.lastReceiptGlobalNo}</div>
                  {fiscal.certificateValidTill && (
                    <div className="mt-1 text-xs text-slate-500">
                      Certificate valid till: {new Date(fiscal.certificateValidTill).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h4 className="mb-4 text-sm font-bold uppercase text-slate-500 tracking-wide">Device Credentials</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device ID</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceID}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceID: e.target.value }))}
                        placeholder="e.g. 1234567890"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Activation Key</label>
                      <input
                        type="password"
                        value={fiscalForm.activationKey}
                        onChange={(e) => setFiscalForm(f => ({ ...f, activationKey: e.target.value }))}
                        placeholder="Device activation key"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Serial No</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceSerialNo}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceSerialNo: e.target.value }))}
                        placeholder="e.g. SN-ABC123"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Model Name</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceModelName}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceModelName: e.target.value }))}
                        placeholder="e.g. tengaPOS-v2"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Model Version</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceModelVersionNo}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceModelVersionNo: e.target.value }))}
                        placeholder="e.g. 2.0.0"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h4 className="mb-4 text-sm font-bold uppercase text-slate-500 tracking-wide">Taxpayer Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">TIN (Tax ID Number)</label>
                      <input
                        type="text"
                        value={fiscalForm.tin}
                        onChange={(e) => setFiscalForm(f => ({ ...f, tin: e.target.value }))}
                        placeholder="10-digit TIN"
                        maxLength={10}
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">VAT Registration No</label>
                      <input
                        type="text"
                        value={fiscalForm.vatNumber}
                        onChange={(e) => setFiscalForm(f => ({ ...f, vatNumber: e.target.value }))}
                        placeholder="VAT number"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h4 className="mb-4 text-sm font-bold uppercase text-slate-500 tracking-wide">Branch / Trading Address</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Branch Name</label>
                      <input
                        type="text"
                        value={fiscalForm.branchName}
                        onChange={(e) => setFiscalForm(f => ({ ...f, branchName: e.target.value }))}
                        placeholder="e.g. Main Branch"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Branch Address</label>
                      <input
                        type="text"
                        value={fiscalForm.branchAddress}
                        onChange={(e) => setFiscalForm(f => ({ ...f, branchAddress: e.target.value }))}
                        placeholder="e.g. 123 Samora Machel Ave, Harare"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Branch Contacts</label>
                      <input
                        type="text"
                        value={fiscalForm.branchContacts}
                        onChange={(e) => setFiscalForm(f => ({ ...f, branchContacts: e.target.value }))}
                        placeholder="e.g. +263 77 123 4567"
                        disabled={!fiscalForm.isEnabled}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {fiscalLoading && (
                  <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">
                    <Loader className="h-4 w-4 animate-spin" /> Loading your ZIMRA configuration…
                  </div>
                )}

                <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <Button onClick={handleFiscalSave} disabled={fiscalSaving}>
                    {fiscalSaving ? 'Saving…' : 'Save Configuration'}
                  </Button>
                  <button
                    onClick={handlePingDevice}
                    disabled={pingLoading || !fiscalForm.isEnabled}
                    title="Test ZIMRA device connection"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {pingLoading ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Test Connection
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'whitelabel' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">White Label Branding</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Your brand replaces tengaPOS branding across the portal, reports, and printed documents.
                    This is a Business/Enterprise add-on set up by tengaPOS — reach out to change it.
                  </p>
                </div>

                {tenant?.whitelabel?.enabled ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300">
                      <CheckCircle className="h-4 w-4" /> White label is active for your account
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">Brand Name</p>
                        <p className="text-sm text-slate-900 dark:text-white">{tenant.whitelabel.brand_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">Support Contact</p>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {tenant.whitelabel.support_email || tenant.whitelabel.support_phone || '—'}
                        </p>
                      </div>
                    </div>
                    {tenant.whitelabel.primary_color && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Brand Colours</p>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700" style={{ backgroundColor: tenant.whitelabel.primary_color }} />
                            <span className="text-xs text-slate-500">Primary</span>
                          </div>
                          {tenant.whitelabel.secondary_color && (
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700" style={{ backgroundColor: tenant.whitelabel.secondary_color }} />
                              <span className="text-xs text-slate-500">Accent</span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Already applied to your PDF report and invoice/quotation exports.
                        </p>
                      </div>
                    )}
                    {tenant.whitelabel.logo_url && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Logo</p>
                        <img src={tenant.whitelabel.logo_url} alt="Brand logo" className="h-12 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500">
                      White label isn't set up on your account yet. It's available on Business and Enterprise plans.
                    </p>
                    <a
                      href="mailto:info@globalspaceweb.co.zw?subject=White%20Label%20Enquiry"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
                    >
                      Contact us to enable it <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'store' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Receipts Config</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    What actually prints on the receipt — store details, TIN, paper size, and layout.
                    {role === 'shop_manager' && ' Changes to your branch need the business owner\'s approval before they take effect.'}
                  </p>
                </div>

                {/* Vendor: pending approval queue */}
                {role === 'vendor' && pendingConfigs.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-900/20">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      {pendingConfigs.length} change{pendingConfigs.length !== 1 ? 's' : ''} awaiting your approval
                    </p>
                    {pendingConfigs.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                        <span className="text-slate-700 dark:text-slate-300">
                          {c.branches?.name || 'Unknown branch'} — {RECEIPT_TEMPLATES.find(t => t.key === c.template_mode)?.label}
                        </span>
                        <div className="flex flex-shrink-0 gap-2">
                          <button onClick={() => handleApproveReceiptConfig(c.id)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">Approve</button>
                          <button onClick={() => handleRejectReceiptConfig(c.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Scope selector */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Applies to</label>
                  {role === 'vendor' ? (
                    <select
                      value={scopeBranchId}
                      onChange={(e) => setScopeBranchId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">All branches (default)</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {branches.find((b) => b.id === homeBranch?.id)?.name || 'Your branch'} only
                    </div>
                  )}
                </div>

                {/* Template mode */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt Template</label>
                  <div className="space-y-2">
                    {RECEIPT_TEMPLATES.map((t, i) => (
                      <label
                        key={t.key}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                          receiptForm.templateMode === t.key
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={receiptForm.templateMode === t.key}
                          onChange={() => setReceiptForm((f) => ({ ...f, templateMode: t.key }))}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Option {i + 1}. {t.label}</p>
                          <p className="text-xs text-slate-500">{t.hint}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Store info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Store Name</label>
                    <input
                      type="text"
                      value={receiptForm.storeName}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, storeName: e.target.value }))}
                      placeholder={tenant?.name || 'Your Business Name'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Store Contacts</label>
                    <input
                      type="text"
                      value={receiptForm.storeContacts}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, storeContacts: e.target.value }))}
                      placeholder="+263 77 123 4567"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Store Address</label>
                  <input
                    type="text"
                    value={receiptForm.storeAddress}
                    onChange={(e) => setReceiptForm((f) => ({ ...f, storeAddress: e.target.value }))}
                    placeholder="123 Samora Machel Ave, Harare"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">TIN</label>
                    <input
                      type="text"
                      value={receiptForm.tin}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, tin: e.target.value }))}
                      placeholder="e.g. 2000123456"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">VAT Registration No.</label>
                    {/* VAT is switched off for this tenant (General settings) —
                        field stays visible but locked, and never prints. */}
                    <input
                      type="text"
                      value={receiptForm.vatNumber}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, vatNumber: e.target.value }))}
                      disabled={tenant?.vat_enabled === false}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                    />
                    {tenant?.vat_enabled === false && (
                      <p className="mt-1 text-xs text-slate-400">VAT is disabled in General settings — this won't appear on receipts.</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Footer Message (optional)</label>
                  <textarea
                    value={receiptForm.footerMessage}
                    onChange={(e) => setReceiptForm((f) => ({ ...f, footerMessage: e.target.value }))}
                    placeholder="Leave blank to use the default 'Thank you for your business!' footer"
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                {/* Printer hardware */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Paper Size</label>
                    <select
                      value={receiptForm.paperWidthMm}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, paperWidthMm: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {PAPER_SIZES.map((p) => <option key={p.mm} value={p.mm}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Printer Connection</label>
                    <select
                      value={receiptForm.printerConnection}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, printerConnection: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {PRINTER_CONNECTIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Optional POS Printer button on the receipt modal */}
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">'POS Printer' Button</span>
                    <p className="text-xs text-slate-500">Show the direct-to-thermal-printer button on the receipt popup. Turn off if you only use the standard Print option.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={receiptForm.showPosPrint}
                      onChange={(e) => setReceiptForm((f) => ({ ...f, showPosPrint: e.target.checked }))}
                      className="peer sr-only"
                    />
                    <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                  </label>
                </div>

                <Button onClick={handleSaveReceiptConfig} disabled={savingReceiptConfig}>
                  {savingReceiptConfig ? 'Saving…' : role === 'shop_manager' ? 'Submit for Approval' : 'Save Changes'}
                </Button>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notifications</h3>
                <p className="text-sm text-slate-500">
                  Low-stock alerts, kitchen order updates, and platform announcements appear automatically
                  in the bell icon at the top of every page — no setup needed.
                </p>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security &amp; Data</h3>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Download Your Data</span>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Export all your products, orders, transactions, staff, branches, and tasks as a single file —
                        useful for backups or if you close your account.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={handleDownloadData} disabled={downloadingData}>
                      <Download className="h-4 w-4" />
                      {downloadingData ? 'Exporting…' : 'Download'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Password</span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Change your password from the sign-in screen using "Forgot password?", or ask an
                    Admin/Shop Manager to reset it for you.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

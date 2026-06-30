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
import toast from 'react-hot-toast'

const sections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'store', label: 'Store', icon: Store },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'receipts', label: 'Receipts', icon: Receipt },
  { id: 'fiscalisation', label: 'ZIMRA Fiscal', icon: Cpu },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'whitelabel', label: 'White Label', icon: Globe },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('general')
  const { posMode, setPosMode } = useThemeStore()
  const { isDemo, tenant } = useAuthStore()
  const fiscal = useFiscalStore()

  // Paynow integration state
  const [paynowId, setPaynowId] = useState('')
  const [paynowKey, setPaynowKey] = useState('')
  const [showPaynowKey, setShowPaynowKey] = useState(false)
  const [paynowSaving, setPaynowSaving] = useState(false)
  const [paynowConfigured, setPaynowConfigured] = useState(false)

  useEffect(() => {
    if (isDemo || !tenant?.id) return
    supabase
      .from('tenants')
      .select('paynow_integration_id, paynow_integration_key')
      .eq('id', tenant.id)
      .single()
      .then(({ data }) => {
        if (data?.paynow_integration_id) {
          setPaynowId(data.paynow_integration_id)
          setPaynowKey(data.paynow_integration_key || '')
          setPaynowConfigured(true)
        }
      })
  }, [isDemo, tenant?.id])

  const handleSavePaynow = async () => {
    if (!paynowId.trim() || !paynowKey.trim()) {
      toast.error('Both Integration ID and Integration Key are required')
      return
    }
    if (isDemo) {
      toast.success('Demo mode — settings not persisted. In production these save to your account.')
      setPaynowConfigured(true)
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

  const [fiscalForm, setFiscalForm] = useState({
    deviceID: fiscal.deviceID,
    activationKey: fiscal.activationKey,
    deviceSerialNo: fiscal.deviceSerialNo,
    deviceModelName: fiscal.deviceModelName,
    deviceModelVersionNo: fiscal.deviceModelVersionNo,
    tin: fiscal.tin,
    vatNumber: fiscal.vatNumber,
    branchName: fiscal.branchName,
    branchAddress: fiscal.branchAddress,
    branchContacts: fiscal.branchContacts,
  })
  const [pingLoading, setPingLoading] = useState(false)

  const handleFiscalSave = () => {
    fiscal.setConfig(fiscalForm)
    toast.success('ZIMRA settings saved')
  }

  const isSupabaseConfigured = !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
  )

  const handlePingDevice = async () => {
    if (!fiscal.isEnabled) {
      toast.error('Enable fiscalisation first')
      return
    }
    if (!fiscal.deviceID) {
      toast.error('Enter and save a Device ID first')
      return
    }
    if (!isSupabaseConfigured) {
      toast.error('Supabase not configured — add VITE_SUPABASE_URL to your environment variables')
      return
    }
    setPingLoading(true)
    try {
      await pingDevice({ deviceID: fiscal.deviceID })
      toast.success('Device reachable — connection OK')
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('not found') || msg.includes('404')) {
        toast.error('Edge Function not deployed yet — deploy zimra-ping to Supabase first')
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
          {sections.map((section) => (
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
            {sections.map((section) => (
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
                    defaultValue="Demo Store"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option>USD - US Dollar</option>
                    <option>ZWL - Zimbabwe Dollar</option>
                    <option>ZAR - South African Rand</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Tax Rate (%)</label>
                  <input
                    type="number"
                    defaultValue="15"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <Button>Save Changes</Button>
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
                <p className="text-sm text-slate-500">Enable or disable payment methods for your store.</p>
                {['Cash', 'EcoCash', 'InnBucks', 'Omari', 'OneMoney', 'ZIPIT', 'Visa', 'Mastercard', 'POS Terminal'].map((method) => (
                  <div key={method} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{method}</span>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" defaultChecked className="peer sr-only" />
                      <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                    </label>
                  </div>
                ))}

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
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">ZIMRA Fiscalisation</span>
                    <p className="text-xs text-slate-500">$20/device/month</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" />
                    <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                  </label>
                </div>
                <Button>Save Changes</Button>
              </div>
            )}

            {activeSection === 'fiscalisation' && (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">ZIMRA Fiscalisation</h3>
                    <p className="text-sm text-slate-500">Connect your ZIMRA fiscal device to issue compliant receipts. $20/device/month.</p>
                  </div>
                  {fiscal.isRegistered && (
                    <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Registered
                    </span>
                  )}
                </div>

                {/* Enable toggle */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Enable Fiscalisation</span>
                    <p className="text-xs text-slate-500">Receipts will be submitted to ZIMRA FDMS on each sale</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={fiscal.isEnabled}
                      onChange={(e) => fiscal.setEnabled(e.target.checked)}
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
                      Certificate valid till: {new Date(fiscal.certificateValidTill).toLocaleDateString()}
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Activation Key</label>
                      <input
                        type="password"
                        value={fiscalForm.activationKey}
                        onChange={(e) => setFiscalForm(f => ({ ...f, activationKey: e.target.value }))}
                        placeholder="Device activation key"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Serial No</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceSerialNo}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceSerialNo: e.target.value }))}
                        placeholder="e.g. SN-ABC123"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Model Name</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceModelName}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceModelName: e.target.value }))}
                        placeholder="e.g. tengaPOS-v2"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Device Model Version</label>
                      <input
                        type="text"
                        value={fiscalForm.deviceModelVersionNo}
                        onChange={(e) => setFiscalForm(f => ({ ...f, deviceModelVersionNo: e.target.value }))}
                        placeholder="e.g. 2.0.0"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">VAT Registration No</label>
                      <input
                        type="text"
                        value={fiscalForm.vatNumber}
                        onChange={(e) => setFiscalForm(f => ({ ...f, vatNumber: e.target.value }))}
                        placeholder="VAT number"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Branch Address</label>
                      <input
                        type="text"
                        value={fiscalForm.branchAddress}
                        onChange={(e) => setFiscalForm(f => ({ ...f, branchAddress: e.target.value }))}
                        placeholder="e.g. 123 Samora Machel Ave, Harare"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Branch Contacts</label>
                      <input
                        type="text"
                        value={fiscalForm.branchContacts}
                        onChange={(e) => setFiscalForm(f => ({ ...f, branchContacts: e.target.value }))}
                        placeholder="e.g. +263 77 123 4567"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <Button onClick={handleFiscalSave}>Save Configuration</Button>
                  <button
                    onClick={handlePingDevice}
                    disabled={pingLoading || !isSupabaseConfigured}
                    title={!isSupabaseConfigured ? 'Requires VITE_SUPABASE_URL environment variable' : 'Ping ZIMRA FDMS via Edge Function'}
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

                <div className={`rounded-xl border p-4 ${isSupabaseConfigured ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isSupabaseConfigured ? 'text-amber-600' : 'text-red-600'}`} />
                    <div className={`text-xs ${isSupabaseConfigured ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                      {!isSupabaseConfigured ? (
                        <><strong>Supabase not connected.</strong> Set <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_URL</code> and <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_ANON_KEY</code> in your environment variables (Vercel dashboard → Project Settings → Environment Variables), then redeploy.</>
                      ) : (
                        <><strong>Edge Functions required.</strong> ZIMRA API calls route through Supabase Edge Functions — the device certificate (mTLS) stays server-side only. Deploy the <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">zimra-*</code> Edge Functions before going live. ZIMRA test gateway: <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">fdmsapitest.zimra.co.zw</code></>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'whitelabel' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">White Label Branding</h3>
                <p className="text-sm text-slate-500">
                  Customize your POS with your own branding. $50 once-off fee.
                </p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Custom Domain</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="yourstore"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-sm text-slate-500">.tengapos.com</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Brand Color</label>
                  <input type="color" defaultValue="#2563eb" className="h-10 w-20 rounded-lg" />
                </div>
                <Button>Enable White Label — $50</Button>
              </div>
            )}

            {activeSection === 'store' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Store Details</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Store Address</label>
                  <input
                    type="text"
                    defaultValue="123 Samora Machel Ave, Harare"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    type="text"
                    defaultValue="+263 77 123 4567"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <Button>Save Changes</Button>
              </div>
            )}

            {(activeSection === 'notifications' || activeSection === 'security') && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold capitalize text-slate-900 dark:text-white">{activeSection}</h3>
                <p className="text-sm text-slate-500">Configure {activeSection} settings for your store.</p>
                <div className="space-y-3">
                  {[
                    { label: 'Low stock alerts', enabled: true },
                    { label: 'Daily sales summary', enabled: true },
                    { label: 'New staff activity', enabled: false },
                    { label: 'Transaction alerts', enabled: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" defaultChecked={item.enabled} className="peer sr-only" />
                        <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-600" />
                      </label>
                    </div>
                  ))}
                </div>
                <Button>Save Changes</Button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

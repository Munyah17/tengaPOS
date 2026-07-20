import { useState, useEffect } from 'react'
import {
  Cpu, CheckCircle, AlertTriangle, Loader, Power, PowerOff,
  Calendar, Hash, Wifi, ToggleLeft, ToggleRight, Sun, Moon,
} from 'lucide-react'
import { useFiscalStore } from '@/stores/fiscalStore'
import { useAuthStore } from '@/stores/authStore'
import { pingDevice, registerDevice } from '@/lib/fiscalApi'
import { supabase } from '@/lib/supabase'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

const isSupabaseConfigured = !!(
  import.meta.env.VITE_SUPABASE_URL &&
  !import.meta.env.VITE_SUPABASE_URL.includes('your-project')
)

export default function Fiscalisation() {
  const fiscal = useFiscalStore()
  const { tenant } = useAuthStore()
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
  const [dayLoading, setDayLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)

  useEffect(() => {
    if (!tenant?.id) return
    const loadFiscalConfig = () => loadWithOfflineCache(
      ['fiscalConfig', tenant.id],
      () => supabase.from('tenant_fiscal_configs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle()
        .then(({ data, error }) => { if (error) throw error; return data }),
      {
        onData: (data) => {
          if (!data) return
          fiscal.loadFromDB(data)
          setFiscalForm({
            deviceID:             data.device_id             || '',
            activationKey:        data.activation_key        || '',
            deviceSerialNo:       data.device_serial_no      || '',
            deviceModelName:      data.device_model_name     || '',
            deviceModelVersionNo: data.device_model_version_no || '',
            tin:                  data.tin                   || '',
            vatNumber:            data.vat_number            || '',
            branchName:           data.branch_name           || '',
            branchAddress:        data.branch_address        || '',
            branchContacts:       data.branch_contacts       || '',
          })
        },
      },
    )
    loadFiscalConfig()
    window.addEventListener('tengapos:force-refresh', loadFiscalConfig)
    return () => window.removeEventListener('tengapos:force-refresh', loadFiscalConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  const handleOpenDay = async () => {
    if (!tenant?.id) { toast.error('Not authenticated'); return }
    setDayLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('zimra-open-day', { body: { tenant_id: tenant.id } })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (data?.warning) {
        toast(`Fiscal day opened locally (ZIMRA unreachable: ${data.warning})`, { duration: 6000 })
        fiscal.setFiscalDayStatus('open')
      } else {
        toast.success(`Fiscal day #${data.fiscalDayNo} opened successfully`)
        fiscal.setFiscalDayStatus('open')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to open fiscal day')
    } finally {
      setDayLoading(false)
    }
  }

  const handleCloseDay = async () => {
    if (!tenant?.id) { toast.error('Not authenticated'); return }
    setDayLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('zimra-close-day', { body: { tenant_id: tenant.id } })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (data?.warning) {
        toast(`Fiscal day closed locally (ZIMRA unreachable: ${data.warning})`, { duration: 6000 })
        fiscal.setFiscalDayStatus('closed')
      } else {
        toast.success(`Fiscal day #${data.fiscalDayNo} closed — ${data.receiptCount} receipts, total ${data.totalSales?.toFixed(2)}`)
        fiscal.setFiscalDayStatus('closed')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to close fiscal day')
    } finally {
      setDayLoading(false)
    }
  }

  const updateForm = (field) => (e) =>
    setFiscalForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = async () => {
    if (!tenant?.id) return
    try {
      const { error } = await supabase
        .from('tenant_fiscal_configs')
        .upsert({
          tenant_id:              tenant.id,
          device_id:              fiscalForm.deviceID              || null,
          activation_key:         fiscalForm.activationKey         || null,
          device_serial_no:       fiscalForm.deviceSerialNo        || null,
          device_model_name:      fiscalForm.deviceModelName       || 'tengaPOS-v2',
          device_model_version_no: fiscalForm.deviceModelVersionNo || '2.0.0',
          tin:                    fiscalForm.tin                   || null,
          vat_number:             fiscalForm.vatNumber             || null,
          branch_name:            fiscalForm.branchName            || null,
          branch_address:         fiscalForm.branchAddress         || null,
          branch_contacts:        fiscalForm.branchContacts        || null,
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'tenant_id' })
      if (error) throw error
      fiscal.setConfig(fiscalForm)
      toast.success('ZIMRA configuration saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save configuration')
    }
  }

  const fiscalUnlocked = tenant?.features?.fiscalisation === true

  const handleEnable = async () => {
    const next = !fiscal.isEnabled
    if (next && !fiscalUnlocked) {
      toast.error('ZIMRA Fiscalisation is a paid add-on — request it in Settings first')
      return
    }
    fiscal.setEnabled(next)
    if (tenant?.id) {
      await supabase
        .from('tenant_fiscal_configs')
        .upsert({ tenant_id: tenant.id, is_enabled: next, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    }
    toast.success(next ? 'ZIMRA fiscalisation enabled' : 'ZIMRA fiscalisation disabled')
  }

  const handleRegisterDevice = async () => {
    if (!tenant?.id) { toast.error('Not authenticated'); return }
    if (!fiscalForm.activationKey) { toast.error('Enter activation key from ZIMRA'); return }
    if (!isSupabaseConfigured) { toast.error('Service not available — contact support'); return }

    setRegisterLoading(true)
    try {
      const result = await registerDevice({
        tenantId: tenant.id,
        activationKey: fiscalForm.activationKey,
        tin: fiscalForm.tin,
        vatNumber: fiscalForm.vatNumber
      })
      if (result?.error) throw new Error(result.error)
      toast.success('Device registered with ZIMRA! Ready to use.')
      fiscal.setRegistered(true)
    } catch (err) {
      toast.error('Registration failed: ' + (err.message || 'Unknown error'))
    } finally {
      setRegisterLoading(false)
    }
  }

  const handlePing = async () => {
    if (!fiscal.isEnabled) {
      toast.error('Enable ZIMRA fiscalisation first')
      return
    }
    // Check the form field being typed into, not the last-saved store value
    // — otherwise a Device ID entered but not yet saved reads as empty here.
    if (!fiscalForm.deviceID) {
      toast.error('Enter a Device ID before testing')
      return
    }
    if (!isSupabaseConfigured) {
      toast.error('Service not available — contact support')
      return
    }
    setPingLoading(true)
    try {
      await pingDevice({ deviceID: fiscalForm.deviceID })
      toast.success('ZIMRA FDMS is reachable — device connected!')
    } catch (err) {
      const msg = err?.message || ''
      toast.error(msg.includes('FunctionNotFound') || msg.includes('404')
        ? 'ZIMRA service unavailable — contact support. Check: 1) Edge functions deployed 2) ZIMRA_BASE_URL set 3) Device exists'
        : `Connection failed: ${msg || 'Unknown error'}`
      )
    } finally {
      setPingLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300'
  // Fiscalisation switched off — the whole configuration is greyed out
  // (visible but not editable or submittable) until it's enabled again.
  const locked = !fiscal.isEnabled

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Fiscalisation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ZIMRA FDMS device configuration and fiscal day management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEnable}
            title={!fiscalUnlocked && !fiscal.isEnabled ? 'Request this add-on in Settings first' : undefined}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              fiscal.isEnabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {fiscal.isEnabled ? (
              <><Power className="h-4 w-4" /> Enabled</>
            ) : (
              <><PowerOff className="h-4 w-4" /> Disabled</>
            )}
          </button>
        </div>
      </div>

      {!fiscalUnlocked && (
        <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">ZIMRA Fiscalisation isn't active yet</h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is a paid add-on. Request it from Settings and it'll unlock here once approved.
          </p>
        </div>
      )}

      {/* ── Fiscal Day Toggle ─────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Fiscal Day Status</h2>
            <p className="text-sm text-slate-500">Open a new fiscal day at the start of each shift. Close it before signing out.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ${fiscal.fiscalDayStatus === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              {fiscal.fiscalDayStatus === 'open' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {fiscal.fiscalDayStatus === 'open' ? `Day #${fiscal.fiscalDayNo || '—'} Open` : 'Day Closed'}
            </div>
            {fiscal.fiscalDayStatus !== 'open' ? (
              <button
                onClick={handleOpenDay}
                disabled={dayLoading || !fiscal.isEnabled}
                className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dayLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Sun className="h-4 w-4" />}
                Open Fiscal Day
              </button>
            ) : (
              <button
                onClick={handleCloseDay}
                disabled={dayLoading}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800"
              >
                {dayLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />}
                Close Fiscal Day
              </button>
            )}
          </div>
        </div>
        {!fiscal.isEnabled && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Enable ZIMRA fiscalisation (toggle above) before opening a fiscal day.</p>
        )}
      </div>


      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Device credentials */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <h2 className="font-bold text-slate-900 dark:text-white">Device Credentials</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Device ID</label>
                <input
                  type="text"
                  value={fiscalForm.deviceID}
                  onChange={updateForm('deviceID')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="e.g. ZW123456"
                />
              </div>
              <div>
                <label className={labelClass}>Activation Key</label>
                <input
                  type="password"
                  value={fiscalForm.activationKey}
                  onChange={updateForm('activationKey')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className={labelClass}>Device Serial No.</label>
                <input
                  type="text"
                  value={fiscalForm.deviceSerialNo}
                  onChange={updateForm('deviceSerialNo')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="SN-XXXXXXXXXX"
                />
              </div>
              <div>
                <label className={labelClass}>Device Model Name</label>
                <input
                  type="text"
                  value={fiscalForm.deviceModelName}
                  onChange={updateForm('deviceModelName')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="e.g. TengaFDMS-v1"
                />
              </div>
            </div>
          </div>

          {/* Taxpayer info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Taxpayer Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>TIN</label>
                <input
                  type="text"
                  value={fiscalForm.tin}
                  onChange={updateForm('tin')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="1234567890"
                />
              </div>
              <div>
                <label className={labelClass}>VAT Number</label>
                <input
                  type="text"
                  value={fiscalForm.vatNumber}
                  onChange={updateForm('vatNumber')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="VAT-XXXXXXXXXX"
                />
              </div>
            </div>
          </div>

          {/* Branch info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Branch / Trading Address</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Branch / Trading Name</label>
                <input
                  type="text"
                  value={fiscalForm.branchName}
                  onChange={updateForm('branchName')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="My Store — Main Branch"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Trading Address</label>
                <input
                  type="text"
                  value={fiscalForm.branchAddress}
                  onChange={updateForm('branchAddress')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="123 Main Street, Harare, Zimbabwe"
                />
              </div>
              <div>
                <label className={labelClass}>Contact Number</label>
                <input
                  type="text"
                  value={fiscalForm.branchContacts}
                  onChange={updateForm('branchContacts')}
                  disabled={locked}
                  className={inputClass}
                  placeholder="+263 77 123 4567"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          {locked && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              {fiscalUnlocked
                ? "ZIMRA fiscalisation is disabled. Use the toggle at the top right to enable it."
                : "ZIMRA fiscalisation isn't active on your account yet. Request it in Settings."}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={locked}
              className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Configuration
            </button>
            <button
              onClick={handlePing}
              disabled={pingLoading || !isSupabaseConfigured || locked}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title={!isSupabaseConfigured ? 'Supabase not configured' : undefined}
            >
              {pingLoading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Test Connection
            </button>
          </div>
        </div>

        {/* Status sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Device Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Enabled</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    fiscal.isEnabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {fiscal.isEnabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Registered</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    fiscal.isRegistered
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}
                >
                  {fiscal.isRegistered ? 'Registered' : 'Not registered'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Fiscal Day</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    fiscal.fiscalDayStatus === 'open'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {fiscal.fiscalDayStatus === 'open' ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Hash className="h-3.5 w-3.5" />
                Fiscal Day No: <span className="font-medium text-slate-900 dark:text-white">{fiscal.fiscalDayNo}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                Last Receipt: <span className="font-medium text-slate-900 dark:text-white">#{fiscal.lastReceiptGlobalNo}</span>
              </div>
              {fiscal.isRegistered && fiscal.certificateValidTill && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  Cert valid till:{' '}
                  <span className="font-medium text-slate-900 dark:text-white">
                    {new Date(fiscal.certificateValidTill).toLocaleDateString('en-GB')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-bold text-slate-900 dark:text-white">QR Verification URL</h3>
            <p className="mb-2 text-xs text-slate-500">Used on fiscal receipts</p>
            <input
              type="text"
              value={fiscal.qrUrl}
              onChange={(e) => fiscal.setConfig({ qrUrl: e.target.value })}
              disabled={locked}
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

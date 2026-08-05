import { useEffect, useState } from 'react'
import { Check, X, Save, Loader2, DollarSign, Megaphone, Image, Trash2 } from 'lucide-react'
import { PLANS, DEFAULT_FEATURES } from '@/pages/admin/AdminTenants'
import { getSetting, updateSetting, DEFAULT_PLAN_PRICING, DEFAULT_FISCAL_PRICING } from '@/lib/platformSettings'
import { stripLeadingZero } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { uploadSiteAsset } from '@/lib/db'
import toast from 'react-hot-toast'

const FEATURE_LABELS = [
  { key: 'pos', label: 'POS / Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'staff', label: 'Staff Management' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'orders', label: 'Orders Board' },
  { key: 'dining_board', label: 'Dining Board' },
  { key: 'drive_through', label: 'Drive-Through' },
  { key: 'fiscalisation', label: 'ZIMRA Fiscalisation' },
  { key: 'api_access', label: 'API Access' },
]

export default function SuperAdminPricing() {
  const { user, role } = useAuthStore()
  const [planPricing, setPlanPricing] = useState(DEFAULT_PLAN_PRICING)
  const [fiscalPricing, setFiscalPricing] = useState(DEFAULT_FISCAL_PRICING)
  const [banner, setBanner] = useState({ enabled: false, title: '', text: '', type: 'info', imageUrl: '', buttons: [] })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const isSuperAdmin = role === 'super_admin'
  const canEditBanner = role === 'super_admin' || role === 'admin'

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await uploadSiteAsset(file)
      setBanner((b) => ({ ...b, imageUrl: url }))
    } catch (err) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    getSetting('plan_pricing', DEFAULT_PLAN_PRICING).then((v) => setPlanPricing({ ...DEFAULT_PLAN_PRICING, ...(v || {}) }))
    getSetting('fiscalisation_pricing', DEFAULT_FISCAL_PRICING).then((v) => setFiscalPricing({ ...DEFAULT_FISCAL_PRICING, ...(v || {}) }))
    getSetting('site_banner', null).then((v) => v && setBanner((b) => ({ ...b, ...v, buttons: v.buttons || [] })))
  }, [])

  const setBannerButton = (index, field, value) =>
    setBanner((b) => {
      const buttons = [...(b.buttons || [])]
      buttons[index] = { ...(buttons[index] || { label: '', url: '' }), [field]: value }
      return { ...b, buttons }
    })

  const setPlanPrice = (key, price) =>
    setPlanPricing((p) => ({ ...p, [key]: { ...p[key], price: Number(price) || 0 } }))
  const setFiscalPrice = (key, price) =>
    setFiscalPricing((p) => ({ ...p, [key]: { ...p[key], price: Number(price) || 0 } }))

  const saveAll = async () => {
    setSaving(true)
    try {
      if (isSuperAdmin) {
        await updateSetting('plan_pricing', planPricing, user?.id)
        await updateSetting('fiscalisation_pricing', fiscalPricing, user?.id)
      }
      if (canEditBanner) {
        await updateSetting('site_banner', banner, user?.id)
      }
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: isSuperAdmin ? 'pricing_updated' : 'banner_updated',
        target_type: 'platform_settings',
        details: isSuperAdmin
          ? { plan_pricing: planPricing, fiscalisation_pricing: fiscalPricing, banner_enabled: banner.enabled }
          : { banner_enabled: banner.enabled },
      })
      toast.success(isSuperAdmin ? 'Pricing published — applies across the whole system' : 'Announcement banner saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Pricing Tiers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isSuperAdmin
              ? 'Edit prices here — checkout, landing page, and revenue reports all update instantly.'
              : 'Plan pricing is read-only here — you can still edit the announcement popup below.'}
          </p>
        </div>
        {(isSuperAdmin || canEditBanner) && (
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSuperAdmin ? 'Publish Prices' : 'Save Banner'}
          </button>
        )}
      </div>

      {/* Site banner control */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-indigo-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Website Announcement Popup</h2>
          <button
            onClick={() => setBanner((b) => ({ ...b, enabled: !b.enabled }))}
            disabled={!canEditBanner}
            className={`ml-auto relative flex h-6 w-11 items-center rounded-full transition-colors ${
              banner.enabled ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${banner.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Shows once per visitor session as a popup on the public website — promotions, notices, launches.
          Remember to hit {isSuperAdmin ? 'Publish Prices' : 'Save Banner'} to save.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={banner.title}
            onChange={(e) => setBanner((b) => ({ ...b, title: e.target.value }))}
            disabled={!canEditBanner}
            placeholder="Title (e.g. 20% Off Launch Week!)"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <select
            value={banner.type}
            onChange={(e) => setBanner((b) => ({ ...b, type: e.target.value }))}
            disabled={!canEditBanner}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            <option value="info">Info (blue)</option>
            <option value="promo">Promo (green)</option>
            <option value="warning">Notice (amber)</option>
          </select>
        </div>

        <textarea
          value={banner.text}
          onChange={(e) => setBanner((b) => ({ ...b, text: e.target.value }))}
          disabled={!canEditBanner}
          rows={2}
          placeholder="Description — e.g. Get 20% off the Pro Package hardware bundle, this month only."
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
        />

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-slate-500">Background image (optional)</p>
          {banner.imageUrl ? (
            <div className="flex items-center gap-3">
              <img src={banner.imageUrl} alt="" className="h-16 w-28 rounded-lg object-cover" />
              {canEditBanner && (
                <button
                  type="button"
                  onClick={() => setBanner((b) => ({ ...b, imageUrl: '' }))}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          ) : (
            canEditBanner && (
              <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-500 dark:border-white/15 dark:text-slate-400">
                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                {uploadingImage ? 'Uploading…' : 'Upload image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            )
          )}
        </div>

        <p className="mb-1.5 mt-3 text-xs font-semibold text-slate-500">Buttons (optional, up to 2)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2">
              <input
                value={banner.buttons?.[i]?.label || ''}
                onChange={(e) => setBannerButton(i, 'label', e.target.value)}
                disabled={!canEditBanner}
                placeholder={`Button ${i + 1} label`}
                className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <input
                value={banner.buttons?.[i]?.url || ''}
                onChange={(e) => setBannerButton(i, 'url', e.target.value)}
                disabled={!canEditBanner}
                placeholder="Link (/checkout or https://...)"
                className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Fiscalisation add-on pricing */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">ZIMRA Fiscalisation Add-on (optional)</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(fiscalPricing).map(([key, p]) => (
            <div key={key} className="rounded-xl border border-slate-100 p-3 dark:border-white/5">
              <p className="text-xs font-semibold text-slate-500">{p.label}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-slate-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.price}
                  onChange={(e) => setFiscalPrice(key, stripLeadingZero(e.target.value))}
                  disabled={!isSuperAdmin}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{p.months} month{p.months !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plan cards with editable prices */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(PLANS).map(([key, plan]) => {
          const Icon = plan.icon
          const features = DEFAULT_FEATURES[key]
          const priced = planPricing[key]
          return (
            <div key={key} className={`rounded-2xl border p-5 ${plan.border} ${plan.bg}`}>
              <div className="flex items-center gap-3">
                <Icon className={`h-6 w-6 ${plan.color}`} />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{plan.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{plan.desc}</p>
                </div>
              </div>

              {priced ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xl font-bold text-slate-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priced.price}
                    onChange={(e) => setPlanPrice(key, stripLeadingZero(e.target.value))}
                    disabled={!isSuperAdmin}
                    className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-2xl font-extrabold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                  />
                  <span className="text-xs text-slate-500">
                    {priced.recurring ? '/ month' : `once-off · ${priced.renewalMonths} months`}
                  </span>
                </div>
              ) : (
                <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">Custom quote</p>
              )}
              {plan.renewalNote && (
                <p className="mt-1 text-xs font-semibold text-green-500">{plan.renewalNote}</p>
              )}

              <div className="mt-4 space-y-1.5 border-t border-slate-200/50 pt-4 dark:border-white/10">
                {FEATURE_LABELS.map(({ key: fk, label }) => {
                  const on = !!features?.[fk]
                  return (
                    <div key={fk} className="flex items-center gap-2 text-xs">
                      {on
                        ? <Check className="h-3.5 w-3.5 text-green-500" />
                        : <X className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />}
                      <span className={on ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}>
                        {label}
                      </span>
                    </div>
                  )
                })}
                <div className="pt-2 text-xs text-slate-500">
                  {['business', 'enterprise'].includes(key) ? (
                    <>Branches, users & reports are <b>negotiated on a need basis</b></>
                  ) : features?.max_users_per_branch !== undefined ? (
                    <>
                      Branches: <b>{features.branches}</b> ·
                      Users/Branch: <b>{features.max_users_per_branch}</b> ·
                      Reports: <b className="capitalize">{features?.reports}</b>
                    </>
                  ) : (
                    <>
                      Branches: <b>{features?.branches === -1 ? 'Unlimited' : features?.branches}</b> ·
                      Users: <b>{features?.max_users === -1 ? 'Unlimited' : features?.max_users}</b> ·
                      Reports: <b className="capitalize">{features?.reports}</b>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        ZIMRA Fiscalisation is an optional add-on on every plan — clients request it from
        Settings, pay online or by cash (cash requests appear on your dashboard for approval).
      </p>
    </div>
  )
}

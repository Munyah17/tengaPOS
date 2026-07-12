// Platform-wide settings stored in the platform_settings table.
// Prices and the site banner are edited by the Super Admin and read
// everywhere else — change once, applies to the whole system.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Fallbacks if the settings row is unreachable (offline, etc.)
export const DEFAULT_PLAN_PRICING = {
  byod_monthly:  { price: 30,  recurring: true,  renewalMonths: 1 },
  standard_plan: { price: 170, recurring: false, renewalMonths: 6 },
  pro_package:   { price: 200, recurring: false, renewalMonths: 6 },
}

export const DEFAULT_FISCAL_PRICING = {
  monthly:   { price: 20,  months: 1,  label: 'Monthly' },
  quarterly: { price: 50,  months: 3,  label: '3 Months' },
  halfyear:  { price: 90,  months: 6,  label: '6 Months' },
  yearly:    { price: 170, months: 12, label: 'Yearly' },
}

export async function getSetting(key, fallback = null) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return fallback
  return data.value
}

export async function updateSetting(key, value, userId) {
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId || null })
  if (error) throw error
}

export function priceLabelFor(key, p) {
  if (!p || p.price == null) return 'Custom quote'
  if (p.recurring) return `$${p.price} / month`
  return `$${p.price} once-off · ${p.renewalMonths} months included`
}

/** Live plan pricing merged over defaults. */
export function usePlanPricing() {
  const [pricing, setPricing] = useState(DEFAULT_PLAN_PRICING)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getSetting('plan_pricing', DEFAULT_PLAN_PRICING).then((v) => {
      setPricing({ ...DEFAULT_PLAN_PRICING, ...(v || {}) })
      setLoading(false)
    })
  }, [])
  return { pricing, loading }
}

/** Live fiscalisation add-on pricing. */
export function useFiscalPricing() {
  const [pricing, setPricing] = useState(DEFAULT_FISCAL_PRICING)
  useEffect(() => {
    getSetting('fiscalisation_pricing', DEFAULT_FISCAL_PRICING).then((v) =>
      setPricing({ ...DEFAULT_FISCAL_PRICING, ...(v || {}) }))
  }, [])
  return pricing
}

/** Public site banner (landing page), toggled by Super Admin. */
export function useSiteBanner() {
  const [banner, setBanner] = useState(null)
  useEffect(() => {
    getSetting('site_banner', null).then(setBanner)
  }, [])
  return banner
}

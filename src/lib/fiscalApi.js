/**
 * ZIMRA Fiscal Device Management System (FDMS) API service layer.
 *
 * Architecture: All ZIMRA API calls go through Supabase Edge Functions.
 * The device certificate (mTLS) is stored server-side only — never exposed to the browser.
 * Each call passes tenant_id so the edge function loads the right vendor credentials from DB.
 * Edge Function URL pattern: /functions/v1/zimra-{action}
 */

import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/edgeFunction'

async function callEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  return data
}

export async function pingDevice({ tenantId, deviceID }) {
  return callEdgeFunction('zimra-ping', { tenant_id: tenantId, deviceID })
}

export async function registerDevice({ tenantId, activationKey, tin, vatNumber }) {
  return invokeEdgeFunction('zimra-register-device', {
    tenant_id: tenantId,
    activation_key: activationKey,
    tin,
    vat_number: vatNumber
  })
}

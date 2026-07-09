/**
 * ZIMRA Fiscal Device Management System (FDMS) API service layer.
 *
 * Architecture: All ZIMRA API calls go through Supabase Edge Functions.
 * The device certificate (mTLS) is stored server-side only — never exposed to the browser.
 * Each call passes tenant_id so the edge function loads the right vendor credentials from DB.
 * Edge Function URL pattern: /functions/v1/zimra-{action}
 */

import { supabase } from '@/lib/supabase'

async function callEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  return data
}

export async function verifyTaxpayer({ tenantId, tin, vatNumber }) {
  return callEdgeFunction('zimra-verify-taxpayer', { tenant_id: tenantId, tin, vatNumber })
}

export async function issueCertificate({ tenantId, deviceID }) {
  return callEdgeFunction('zimra-issue-certificate', { tenant_id: tenantId, deviceID })
}

export async function getDeviceConfig({ tenantId, deviceID }) {
  return callEdgeFunction('zimra-get-config', { tenant_id: tenantId, deviceID })
}

export async function getDeviceStatus({ tenantId, deviceID }) {
  return callEdgeFunction('zimra-get-status', { tenant_id: tenantId, deviceID })
}

export async function pingDevice({ tenantId, deviceID }) {
  return callEdgeFunction('zimra-ping', { tenant_id: tenantId, deviceID })
}

export async function openFiscalDay({ tenantId, deviceID, fiscalDayNo }) {
  return callEdgeFunction('zimra-open-day', { tenant_id: tenantId, deviceID, fiscalDayNo })
}

export async function submitReceipt({ tenantId, deviceID, receipt }) {
  return callEdgeFunction('zimra-submit-receipt', { tenant_id: tenantId, deviceID, receipt })
}

export async function closeFiscalDay({ tenantId, deviceID, fiscalDayNo, counters }) {
  return callEdgeFunction('zimra-close-day', { tenant_id: tenantId, deviceID, fiscalDayNo, counters })
}

export async function registerDevice({ tenantId, activationKey, tin, vatNumber }) {
  return callEdgeFunction('zimra-register-device', {
    tenant_id: tenantId,
    activation_key: activationKey,
    tin,
    vat_number: vatNumber
  })
}

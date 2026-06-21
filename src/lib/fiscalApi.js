/**
 * ZIMRA Fiscal Device Management System (FDMS) API service layer.
 *
 * Architecture: All ZIMRA API calls go through Supabase Edge Functions.
 * The device certificate (mTLS) is stored server-side only — never exposed to the browser.
 * Edge Function URL pattern: /functions/v1/zimra-{action}
 */

import { supabase } from '@/lib/supabase'

async function callEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Verify taxpayer information before device registration.
 * ZIMRA endpoint: POST /verifyTaxpayerInformation
 */
export async function verifyTaxpayer({ tin, vatNumber }) {
  return callEdgeFunction('zimra-verify-taxpayer', { tin, vatNumber })
}

/**
 * Register a new fiscal device with ZIMRA.
 * ZIMRA endpoint: POST /registerDevice
 */
export async function registerDevice({ deviceID, activationKey, tin }) {
  return callEdgeFunction('zimra-register-device', { deviceID, activationKey, tin })
}

/**
 * Issue/renew the device certificate.
 * ZIMRA endpoint: POST /issueCertificate
 */
export async function issueCertificate({ deviceID }) {
  return callEdgeFunction('zimra-issue-certificate', { deviceID })
}

/**
 * Get device configuration (qrUrl, tax rates, etc) from ZIMRA.
 * ZIMRA endpoint: GET /getConfig
 */
export async function getDeviceConfig({ deviceID }) {
  return callEdgeFunction('zimra-get-config', { deviceID })
}

/**
 * Get current device status from ZIMRA.
 * ZIMRA endpoint: GET /getStatus
 */
export async function getDeviceStatus({ deviceID }) {
  return callEdgeFunction('zimra-get-status', { deviceID })
}

/**
 * Ping the ZIMRA FDMS to check connectivity.
 * ZIMRA endpoint: GET /ping
 */
export async function pingDevice({ deviceID }) {
  return callEdgeFunction('zimra-ping', { deviceID })
}

/**
 * Open a fiscal day on the device.
 * ZIMRA endpoint: POST /openDay
 */
export async function openFiscalDay({ deviceID, fiscalDayNo }) {
  return callEdgeFunction('zimra-open-day', { deviceID, fiscalDayNo })
}

/**
 * Submit a fiscalised receipt to ZIMRA.
 * ZIMRA endpoint: POST /submitReceipt
 * The Edge Function handles receipt signing and QR code generation.
 */
export async function submitReceipt({ deviceID, receipt }) {
  return callEdgeFunction('zimra-submit-receipt', { deviceID, receipt })
}

/**
 * Initiate fiscal day close.
 * ZIMRA endpoint: POST /closeDay
 */
export async function closeFiscalDay({ deviceID, fiscalDayNo, counters }) {
  return callEdgeFunction('zimra-close-day', { deviceID, fiscalDayNo, counters })
}

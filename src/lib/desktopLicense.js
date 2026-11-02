// Client for the desktop-license edge function (docs/desktop-license-api-v1.md).
// Tenant-admin and super-admin endpoints take the session JWT; device
// endpoints are called by the desktop client itself, not this app.
import { supabase } from './supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desktop-license`

async function call(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FN_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`)
  return data
}

// ─── Tenant admin: activation codes + devices ───
export const listActivationCodes = () => call('/v1/activation-codes')
export const createActivationCode = (payload) =>
  call('/v1/activation-codes', { method: 'POST', body: payload })
export const revokeActivationCode = (codeId) =>
  call(`/v1/activation-codes/${codeId}`, { method: 'DELETE' })
export const listDevices = () => call('/v1/devices')
export const revokeDevice = (deviceId, reason) =>
  call(`/v1/devices/${deviceId}/revoke`, { method: 'POST', body: { reason } })
export const unrevokeDevice = (deviceId) =>
  call(`/v1/devices/${deviceId}/unrevoke`, { method: 'POST', body: {} })

// ─── Once-off $150 license purchases (contract §2.2b) ───
export const purchaseLicense = ({ deviceLabel, paymentRef }) =>
  call('/v1/licenses/purchase', {
    method: 'POST',
    body: { device_label: deviceLabel, payment_ref: paymentRef },
  })
export const listLicenses = () => call('/v1/licenses')
export const linkPurchasePayment = (purchaseId, paymentRef) =>
  call(`/v1/licenses/purchases/${purchaseId}`, { method: 'PATCH', body: { payment_ref: paymentRef } })
export const purchaseStripeCheckout = (purchaseId) =>
  call(`/v1/licenses/purchases/${purchaseId}/stripe-checkout`, {
    method: 'POST',
    body: { return_url: `${window.location.origin}/app/desktop` },
  })

// ─── Public: installer download ───
export const getDownloadInfo = (os = 'win32-x64', channel = 'stable') =>
  call(`/v1/download/info?os=${os}&channel=${channel}`)
export const getMeta = () => call('/v1/meta')

// ─── Super admin: releases ───
export const listReleases = () => call('/v1/releases')
export const createRelease = (payload) => call('/v1/releases', { method: 'POST', body: payload })
export const patchRelease = (releaseId, patch) =>
  call(`/v1/releases/${releaseId}`, { method: 'PATCH', body: patch })

// ─── Super admin: fleet + security (contract §2.9) ───
export const adminIssueLicense = ({ tenantId, deviceLabel, ttlMinutes }) =>
  call('/v1/admin/licenses', {
    method: 'POST',
    body: { tenant_id: tenantId, device_label: deviceLabel, ttl_minutes: ttlMinutes },
  })
export const adminListLicenses = () => call('/v1/admin/licenses')
export const adminMarkPurchasePaid = (purchaseId, status = 'paid') =>
  call(`/v1/admin/licenses/purchases/${purchaseId}`, { method: 'PATCH', body: { status } })
export const adminListDevices = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return call(`/v1/admin/devices${q ? `?${q}` : ''}`)
}
export const adminGetDevice = (deviceId) => call(`/v1/admin/devices/${deviceId}`)
export const adminSuspendDevice = (deviceId, reason) =>
  call(`/v1/admin/devices/${deviceId}/suspend`, { method: 'POST', body: { reason } })
export const adminRevokeDevice = (deviceId, reason) =>
  call(`/v1/admin/devices/${deviceId}/revoke`, { method: 'POST', body: { reason } })
export const adminDeleteDevice = (deviceId) =>
  call(`/v1/admin/devices/${deviceId}/delete`, { method: 'POST', body: {} })
export const adminListEvents = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return call(`/v1/admin/events${q ? `?${q}` : ''}`)
}
export const adminGetStats = () => call('/v1/admin/stats')
export const adminListDownloads = () => call('/v1/admin/downloads')
export const adminListReports = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return call(`/v1/admin/reports${q ? `?${q}` : ''}`)
}
export const adminListInfringements = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return call(`/v1/admin/infringements${q ? `?${q}` : ''}`)
}
export const adminCreateInfringement = (payload) =>
  call('/v1/admin/infringements', { method: 'POST', body: payload })
export const adminPatchInfringement = (caseId, patch) =>
  call(`/v1/admin/infringements/${caseId}`, { method: 'PATCH', body: patch })

/** Upload an installer to the private desktop-releases bucket; returns
 *  { storage_path, sha256, size_bytes } ready for createRelease(). */
export async function uploadInstaller(file, version, os = 'win32-x64') {
  const sha256 = await sha256File(file)
  const path = `${version}/${os}/${file.name}`
  const { error } = await supabase.storage
    .from('desktop-releases')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
  if (error) throw new Error(error.message)
  return { os, storage_path: path, sha256, size_bytes: file.size }
}

async function sha256File(file) {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

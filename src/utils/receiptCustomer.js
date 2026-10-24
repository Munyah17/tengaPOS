// This account-specific capability must also be checked by the checkout RPC.
export const RECEIPT_CUSTOMER_TENANT_SLUG = 'siyaya-fit-271e5024'

export function canCaptureReceiptCustomer(tenant) {
  return tenant?.slug === RECEIPT_CUSTOMER_TENANT_SLUG
}

export function normalizeReceiptCustomer(details) {
  const result = {}
  for (const [key, limit] of [['name', 120], ['phone', 40], ['email', 254]]) {
    const value = typeof details?.[key] === 'string' ? Array.from(details[key]).filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127).join('').trim().slice(0, limit) : ''
    if (value) result[key] = value
  }
  return Object.keys(result).length ? result : null
}

export function receiptCustomerLines(details) {
  const customer = normalizeReceiptCustomer(details)
  return [['Customer', customer?.name], ['Phone', customer?.phone], ['Email', customer?.email]]
    .filter(([, value]) => value)
}

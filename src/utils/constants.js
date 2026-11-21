// Currencies supported for a tenant's store. ZiG and ZAR use their real
// ISO 4217 codes so Intl.NumberFormat renders them correctly.
export const CURRENCIES = [
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'ZWG', label: 'ZiG - Zimbabwe Gold' },
  { code: 'ZAR', label: 'ZAR - South African Rand' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'SEK', label: 'SEK - Swedish Krona' },
  { code: 'AUD', label: 'AUD - Australian Dollar' },
  { code: 'BWP', label: 'BWP - Botswana Pula' },
  { code: 'ZMW', label: 'ZMW - Zambian Kwacha' },
  { code: 'CAD', label: 'CAD - Canadian Dollar' },
]

export const PAYMENT_PROVIDERS = [
  { id: 'stripe', name: 'Stripe', desc: 'Cards worldwide — Visa, Mastercard, and more', status: 'available' },
  { id: 'paynow', name: 'Paynow', desc: 'EcoCash, OneMoney, InnBucks, Omari, ZIPIT', status: 'available' },
  { id: 'vpay', name: 'vPay Smart', desc: 'Zimbabwean smart payments network', status: 'coming_soon' },
  { id: 'paypal', name: 'PayPal', desc: 'Accept PayPal balance and linked cards', status: 'coming_soon' },
  { id: 'innbucks', name: 'InnBucks', desc: 'Available now — routed through your Paynow account', status: 'via_paynow' },
  { id: 'omari', name: 'Omari', desc: 'Available now — routed through your Paynow account', status: 'via_paynow' },
]

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'Banknote' },
  { id: 'ecocash', label: 'EcoCash', icon: 'Smartphone' },
  { id: 'innbucks', label: 'InnBucks', icon: 'Smartphone' },
  { id: 'omari', label: 'Omari', icon: 'Smartphone' },
  { id: 'onemoney', label: 'OneMoney', icon: 'Smartphone' },
  { id: 'zipit', label: 'ZIPIT', icon: 'ArrowLeftRight' },
  { id: 'visa', label: 'Visa', icon: 'CreditCard' },
  { id: 'mastercard', label: 'Mastercard', icon: 'CreditCard' },
  { id: 'pos_terminal', label: 'POS Terminal', icon: 'Monitor' },
]

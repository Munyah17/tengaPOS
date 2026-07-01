/**
 * Fiscal store — RUNTIME state only (day status, counters, last hash).
 * Credentials (device_id, TIN, etc.) live in `tenant_fiscal_configs` in Supabase.
 * This store is NOT persisted so it always re-fetches from DB on page load.
 */
import { create } from 'zustand'

export const useFiscalStore = create((set, get) => ({
  // Credentials — populated by loadFromDB()
  deviceID:             '',
  activationKey:        '',
  deviceSerialNo:       '',
  deviceModelName:      'tengaPOS-v2',
  deviceModelVersionNo: '2.0.0',
  tin:                  '',
  vatNumber:            '',
  branchName:           '',
  branchAddress:        '',
  branchContacts:       '',
  isEnabled:            false,
  isRegistered:         false,
  certificateValidTill: null,
  qrUrl:                'https://www.zimra.co.zw/verify',

  // Runtime state (volatile, per-session)
  fiscalDayStatus:        'FiscalDayClosed',
  fiscalDayNo:            0,
  lastReceiptGlobalNo:    0,
  lastReceiptHash:        '',

  // DB load status
  dbLoaded: false,

  /** Bulk-set from DB row */
  loadFromDB: (row) => set({
    deviceID:             row.device_id             || '',
    activationKey:        row.activation_key        || '',
    deviceSerialNo:       row.device_serial_no      || '',
    deviceModelName:      row.device_model_name     || 'tengaPOS-v2',
    deviceModelVersionNo: row.device_model_version_no || '2.0.0',
    tin:                  row.tin                   || '',
    vatNumber:            row.vat_number            || '',
    branchName:           row.branch_name           || '',
    branchAddress:        row.branch_address        || '',
    branchContacts:       row.branch_contacts       || '',
    isEnabled:            row.is_enabled            ?? false,
    isRegistered:         row.is_registered         ?? false,
    certificateValidTill: row.certificate_valid_till ?? null,
    qrUrl:                row.qr_url               || 'https://www.zimra.co.zw/verify',
    fiscalDayStatus:      row.fiscal_day_status     || 'FiscalDayClosed',
    fiscalDayNo:          row.fiscal_day_no         ?? 0,
    lastReceiptGlobalNo:  row.last_receipt_global_no ?? 0,
    lastReceiptHash:      row.last_receipt_hash     || '',
    dbLoaded:             true,
  }),

  setConfig: (config) => set(config),
  setEnabled: (isEnabled) => set({ isEnabled }),
  setRegistered: ({ isRegistered, certificateValidTill }) => set({ isRegistered, certificateValidTill }),
  setFiscalDayStatus: (fiscalDayStatus, fiscalDayNo) =>
    set({ fiscalDayStatus, ...(fiscalDayNo !== undefined ? { fiscalDayNo } : {}) }),
  incrementReceiptNo: () =>
    set((s) => ({ lastReceiptGlobalNo: s.lastReceiptGlobalNo + 1 })),
  setLastReceiptHash: (lastReceiptHash) => set({ lastReceiptHash }),

  resetConfig: () => set({
    deviceID: '', activationKey: '', deviceSerialNo: '',
    deviceModelName: 'tengaPOS-v2', deviceModelVersionNo: '2.0.0',
    tin: '', vatNumber: '', branchName: '', branchAddress: '', branchContacts: '',
    isEnabled: false, isRegistered: false, certificateValidTill: null,
    fiscalDayStatus: 'FiscalDayClosed', fiscalDayNo: 0,
    lastReceiptGlobalNo: 0, lastReceiptHash: '', dbLoaded: false,
  }),
}))

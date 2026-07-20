/**
 * Effective receipt branding/config for the current branch — real,
 * persisted store name/address/TIN/etc. that replaces the old broken
 * "Store Details" Settings tab. Not persisted to localStorage; reloaded on
 * tenant/branch change (see AppLayout) so it's always current. AppLayout
 * wraps the fetch in the shared IndexedDB offline cache, so a reload while
 * offline still paints the tenant's real branding instead of falling back
 * to placeholder values.
 */
import { create } from 'zustand'

export const useReceiptConfigStore = create((set) => ({
  loaded: false,
  // Which tenant:branch the loaded values belong to — lets loadFromDB tell a
  // genuine tenant/branch switch apart from a transient empty re-read.
  scopeKey: null,
  templateMode: 'zimra_default',
  storeName: '',
  storeAddress: '',
  storeContacts: '',
  tin: '',
  vatNumber: '',
  footerMessage: '',
  paperWidthMm: 80,
  printerConnection: 'usb',
  showPosPrint: true,
  headerMessage: '',
  customLines: [],

  loadFromDB: (row, scopeKey = null) => set((s) => {
    // A null row for the scope we already have real values for means the
    // re-read came back empty (auth blip, brief RLS gap on token refresh) —
    // keep the last-known-good config instead of wiping it, which is what
    // used to make receipts silently fall back to demo placeholder data.
    if (!row && s.loaded && s.scopeKey === scopeKey) return {}
    return {
      loaded: true,
      scopeKey,
      templateMode: row?.template_mode || 'zimra_default',
      storeName: row?.store_name || '',
      storeAddress: row?.store_address || '',
      storeContacts: row?.store_contacts || '',
      tin: row?.tin || '',
      vatNumber: row?.vat_number || '',
      footerMessage: row?.footer_message || '',
      paperWidthMm: row?.paper_width_mm || 80,
      printerConnection: row?.printer_connection || 'usb',
      showPosPrint: row?.show_pos_print !== false,
      headerMessage: row?.header_message || '',
      customLines: Array.isArray(row?.custom_lines) ? row.custom_lines : [],
    }
  }),

  reset: () => set({
    loaded: false, scopeKey: null, templateMode: 'zimra_default', storeName: '',
    storeAddress: '', storeContacts: '', tin: '', vatNumber: '', footerMessage: '',
    paperWidthMm: 80, printerConnection: 'usb', showPosPrint: true,
    headerMessage: '', customLines: [],
  }),
}))

/**
 * Effective receipt branding/config for the current branch — real,
 * persisted store name/address/TIN/etc. that replaces the old broken
 * "Store Details" Settings tab. Not persisted to localStorage; reloaded on
 * tenant/branch change (see AppLayout) so it's always current.
 */
import { create } from 'zustand'

export const useReceiptConfigStore = create((set) => ({
  loaded: false,
  templateMode: 'zimra_default',
  storeName: '',
  storeAddress: '',
  storeContacts: '',
  tin: '',
  vatNumber: '',
  footerMessage: '',
  paperWidthMm: 80,
  printerConnection: 'usb',

  loadFromDB: (row) => set({
    loaded: true,
    templateMode: row?.template_mode || 'zimra_default',
    storeName: row?.store_name || '',
    storeAddress: row?.store_address || '',
    storeContacts: row?.store_contacts || '',
    tin: row?.tin || '',
    vatNumber: row?.vat_number || '',
    footerMessage: row?.footer_message || '',
    paperWidthMm: row?.paper_width_mm || 80,
    printerConnection: row?.printer_connection || 'usb',
  }),

  reset: () => set({
    loaded: false, templateMode: 'zimra_default', storeName: '', storeAddress: '',
    storeContacts: '', tin: '', vatNumber: '', footerMessage: '', paperWidthMm: 80,
    printerConnection: 'usb',
  }),
}))

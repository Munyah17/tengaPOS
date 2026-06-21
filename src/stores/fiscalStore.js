import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useFiscalStore = create(
  persist(
    (set) => ({
      // Device credentials
      deviceID: '',
      activationKey: '',
      deviceSerialNo: '',
      deviceModelName: '',
      deviceModelVersionNo: '',

      // Taxpayer info
      tin: '',
      vatNumber: '',

      // Branch info
      branchName: '',
      branchAddress: '',
      branchContacts: '',

      // Runtime state
      isEnabled: false,
      isRegistered: false,
      certificateValidTill: null,
      fiscalDayStatus: 'FiscalDayClosed', // FiscalDayClosed | FiscalDayOpened | FiscalDayCloseInitiated | FiscalDayCloseFailed
      fiscalDayNo: 0,
      lastReceiptGlobalNo: 0,
      lastReceiptHash: '',
      qrUrl: 'https://www.zimra.co.zw/verify',

      setConfig: (config) => set(config),

      setEnabled: (isEnabled) => set({ isEnabled }),

      setRegistered: ({ isRegistered, certificateValidTill }) =>
        set({ isRegistered, certificateValidTill }),

      setFiscalDayStatus: (fiscalDayStatus, fiscalDayNo) =>
        set({ fiscalDayStatus, ...(fiscalDayNo !== undefined ? { fiscalDayNo } : {}) }),

      incrementReceiptNo: () =>
        set((state) => ({ lastReceiptGlobalNo: state.lastReceiptGlobalNo + 1 })),

      setLastReceiptHash: (lastReceiptHash) => set({ lastReceiptHash }),

      resetConfig: () =>
        set({
          deviceID: '',
          activationKey: '',
          deviceSerialNo: '',
          deviceModelName: '',
          deviceModelVersionNo: '',
          tin: '',
          vatNumber: '',
          branchName: '',
          branchAddress: '',
          branchContacts: '',
          isEnabled: false,
          isRegistered: false,
          certificateValidTill: null,
          fiscalDayStatus: 'FiscalDayClosed',
          fiscalDayNo: 0,
          lastReceiptGlobalNo: 0,
          lastReceiptHash: '',
        }),
    }),
    { name: 'tengapos-fiscal' }
  )
)

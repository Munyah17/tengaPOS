import { create } from 'zustand'

export const usePosStore = create((set) => ({
  searchQuery: '',
  selectedCategory: 'all',
  isCheckoutOpen: false,
  receiptData: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  toggleCheckout: () => set((s) => ({ isCheckoutOpen: !s.isCheckoutOpen })),
  setReceiptData: (data) => set({ receiptData: data }),
  clearReceipt: () => set({ receiptData: null }),
}))

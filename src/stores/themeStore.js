import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set) => ({
      mode: 'light',
      posMode: 'retail',

      toggleMode: () =>
        set((state) => {
          const next = state.mode === 'light' ? 'dark' : 'light'
          document.documentElement.classList.toggle('dark', next === 'dark')
          return { mode: next }
        }),

      setPosMode: (posMode) => set({ posMode }),

      initTheme: () =>
        set((state) => {
          document.documentElement.classList.toggle('dark', state.mode === 'dark')
          return state
        }),
    }),
    { name: 'tengapos-theme' }
  )
)

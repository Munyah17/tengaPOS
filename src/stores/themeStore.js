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
          document.documentElement.style.colorScheme = next
          return { mode: next }
        }),

      setPosMode: (posMode) => set({ posMode }),

      initTheme: () =>
        set((state) => {
          const isDark = state.mode === 'dark'
          document.documentElement.classList.toggle('dark', isDark)
          document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
          return state
        }),
    }),
    { name: 'tengapos-theme', partialize: (state) => ({ mode: state.mode, posMode: state.posMode }) }
  )
)

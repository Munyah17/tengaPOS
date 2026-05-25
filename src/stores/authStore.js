import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      session: null,
      profile: null,
      tenant: null,
      role: null,
      branch: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: ({ user, session, profile, tenant, role, branch }) =>
        set({
          user,
          session,
          profile,
          tenant,
          role,
          branch,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      clearAuth: () =>
        set({
          user: null,
          session: null,
          profile: null,
          tenant: null,
          role: null,
          branch: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'tengapos-auth',
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        tenant: state.tenant,
        role: state.role,
        branch: state.branch,
      }),
    }
  )
)

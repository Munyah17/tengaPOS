import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export const DEMO_PERSONAS = [
  {
    name: 'Admire Moyo',
    role: 'vendor',
    description: 'Business owner — default role for all sign-ups',
    color: 'green',
    email: 'admire@demo.tengapos.co.zw',
    tenant: 'Moyo General Store',
  },
  {
    name: 'Tatenda Chikwanda',
    role: 'shop_manager',
    description: 'No billing / white-label',
    color: 'blue',
    email: 'tatenda@demo.tengapos.co.zw',
    tenant: 'Moyo General Store',
  },
  {
    name: 'Farai Ncube',
    role: 'supervisor',
    description: 'Shift reports, discounts, void items',
    color: 'purple',
    email: 'farai@demo.tengapos.co.zw',
    tenant: 'Moyo General Store',
  },
  {
    name: 'Grace Kamau',
    role: 'cashier',
    description: 'POS + orders + kitchen only',
    color: 'teal',
    email: 'grace@demo.tengapos.co.zw',
    tenant: 'Moyo General Store',
  },
  {
    name: 'Chipo Banda',
    role: 'shop_assistant',
    description: 'POS + kitchen only',
    color: 'gray',
    email: 'chipo@demo.tengapos.co.zw',
    tenant: 'Moyo General Store',
  },
  {
    name: 'Support Agent',
    role: 'tech_support',
    description: 'Read-only system access',
    color: 'orange',
    email: 'support@demo.tengapos.co.zw',
    tenant: 'System',
  },
]

export const ROLE_COLORS = {
  vendor: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  shop_manager: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  supervisor: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  cashier: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-400' },
  shop_assistant: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-300' },
  tech_support: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  super_admin: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  admin: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400' },
  associate: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400' },
}

export const ROLE_LABELS = {
  vendor: 'Vendor',
  shop_manager: 'Shop Manager',
  supervisor: 'Supervisor',
  cashier: 'Cashier',
  shop_assistant: 'Shop Assistant',
  tech_support: 'Tech Support',
  super_admin: 'Super Admin',
  admin: 'Admin',
  associate: 'Associate',
}

export const NAV_PERMISSIONS = {
  super_admin: ['dashboard', 'pos', 'inventory', 'orders', 'kitchen', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  admin: ['dashboard', 'pos', 'inventory', 'orders', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  associate: ['dashboard', 'reports', 'branches'],
  vendor: ['dashboard', 'pos', 'inventory', 'orders', 'kitchen', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  shop_manager: ['dashboard', 'pos', 'inventory', 'orders', 'kitchen', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  supervisor: ['dashboard', 'pos', 'inventory', 'orders', 'transactions', 'reports', 'tasks'],
  cashier: ['pos', 'orders', 'tasks'],
  shop_assistant: ['pos', 'tasks'],
  tech_support: ['dashboard', 'reports', 'insights', 'orders', 'transactions'],
}

async function loadProfile(userId) {
  // Check app_users first (Super Admin / Admin / Tech Support)
  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (appUser) {
    return { ...appUser, userType: 'app_owner' }
  }

  // Tenant user
  const { data, error } = await supabase
    .from('users')
    .select('*, tenants(*)')
    .eq('id', userId)
    .single()
  if (error) throw error

  const { data: branch } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', data.tenant_id)
    .eq('is_main', true)
    .maybeSingle()

  return { ...data, branch, userType: 'tenant', tenantStatus: data.tenants?.status || 'pending' }
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      tenant: null,
      role: null,
      branch: null,
      userType: null,
      tenantStatus: null,
      isAuthenticated: false,
      isLoading: true,
      isDemo: false,

      initAuth: async () => {
        set({ isLoading: true })

        // Demo sessions are fully isolated from real Supabase auth.
        // If the persisted state says we're in demo mode, honour it and skip
        // the real session check entirely — a saved browser session must never
        // hijack a demo user and redirect them to /admin.
        if (get().isDemo) {
          set({ isLoading: false })
          return
        }

        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const profileData = await loadProfile(session.user.id)
            set({
              user: session.user,
              session,
              profile: profileData,
              tenant: profileData.tenants || null,
              role: profileData.role,
              branch: profileData.branch || null,
              userType: profileData.userType,
              tenantStatus: profileData.tenantStatus || null,
              isAuthenticated: true,
              isLoading: false,
              isDemo: false,
            })
          } else {
            set({ isLoading: false, isAuthenticated: false })
          }
        } catch {
          set({ isLoading: false, isAuthenticated: false })
        }
      },

      signIn: async (email, password) => {
        set({ isLoading: true })
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { set({ isLoading: false }); throw error }
        const profileData = await loadProfile(data.user.id)
        set({
          user: data.user,
          session: data.session,
          profile: profileData,
          tenant: profileData.tenants || null,
          role: profileData.role,
          branch: profileData.branch || null,
          userType: profileData.userType,
          tenantStatus: profileData.tenantStatus || null,
          isAuthenticated: true,
          isLoading: false,
          isDemo: false,
        })
        return profileData.userType
      },

      signUp: async (email, password, name, businessName) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, business_name: businessName } },
        })
        if (error) throw error
        return data
      },

      loginAsDemo: async (persona) => {
        // Sign out any real Supabase session first — demo must be fully isolated.
        // Without this, a saved browser session survives page reload and overwrites demo state.
        await supabase.auth.signOut()
        set({
          user: { id: `demo-${persona.role}`, email: persona.email },
          session: { access_token: 'demo-token' },
          profile: { name: persona.name, email: persona.email, role: persona.role },
          tenant: { id: 'demo-tenant', name: persona.tenant },
          role: persona.role,
          branch: { id: 'demo-branch', name: 'Main Branch' },
          userType: 'tenant',
          tenantStatus: 'active',
          isAuthenticated: true,
          isLoading: false,
          isDemo: true,
        })
      },

      clearAuth: async () => {
        if (!get().isDemo) {
          await supabase.auth.signOut()
        }
        set({
          user: null,
          session: null,
          profile: null,
          tenant: null,
          role: null,
          branch: null,
          userType: null,
          tenantStatus: null,
          isAuthenticated: false,
          isLoading: false,
          isDemo: false,
        })
      },

      setAuth: ({ user, session, profile, tenant, role, branch }) =>
        set({ user, session, profile, tenant, role, branch, isAuthenticated: !!user, isLoading: false }),

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
        userType: state.userType,
        isAuthenticated: state.isAuthenticated,
        tenantStatus: state.tenantStatus,
        // isDemo intentionally NOT persisted — demo sessions never survive a page reload
        // This prevents a crashed demo tab from bleeding into a real tenant login
      }),
    }
  )
)

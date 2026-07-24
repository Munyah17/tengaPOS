import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

// On a weak/slow connection, signInWithPassword could otherwise hang for a
// very long time with no feedback (the browser's own fetch timeout, if any,
// is much longer than a cashier will wait). Fail fast with a clear message
// instead so the login form can show "try again" rather than a dead spinner.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

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
  super_admin: ['dashboard', 'pos', 'inventory', 'orders', 'kitchen', 'job_cards', 'vehicle_registry', 'mechanics', 'quotations', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  admin: ['dashboard', 'pos', 'inventory', 'orders', 'job_cards', 'vehicle_registry', 'mechanics', 'quotations', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'settings'],
  associate: ['dashboard', 'reports', 'branches'],
  vendor: ['dashboard', 'requests', 'pos', 'inventory', 'orders', 'kitchen', 'job_cards', 'vehicle_registry', 'mechanics', 'quotations', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'fiscalisation', 'payments', 'hr', 'invoicing', 'settings'],
  // Shop managers run day-to-day operations for their own branch — payment
  // gateway management and ZIMRA fiscal device registration stay Vendor-only.
  shop_manager: ['dashboard', 'pos', 'inventory', 'orders', 'kitchen', 'job_cards', 'vehicle_registry', 'mechanics', 'quotations', 'transactions', 'reports', 'insights', 'staff', 'tasks', 'branches', 'hr', 'invoicing', 'settings'],
  supervisor: ['dashboard', 'pos', 'inventory', 'orders', 'job_cards', 'vehicle_registry', 'mechanics', 'quotations', 'transactions', 'reports', 'tasks', 'invoicing'],
  cashier: ['pos', 'orders', 'job_cards', 'tasks'],
  shop_assistant: ['pos', 'tasks'],
  tech_support: ['dashboard', 'reports', 'insights', 'orders', 'transactions'],
}

async function loadProfile() {
  // Single round trip via RPC instead of up to 3 sequential queries
  // (app_users check, then users+tenants join, then a separate branches
  // lookup) — meaningful latency savings on a slow connection, since this
  // runs on every login and every app boot.
  const { data, error } = await supabase.rpc('get_my_profile')
  if (error) throw error
  if (!data) throw new Error('Profile not found')
  return data
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

      initAuth: async () => {
        set({ isLoading: true })
        try {
          // getSession() reads the persisted Supabase session locally — this
          // succeeds offline as long as a prior login stored one.
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            try {
              // A slow (not fully offline) connection shouldn't hang the
              // whole app boot indefinitely — fall through to the cached-
              // profile branch below just like an outright failure would.
              const profileData = await withTimeout(loadProfile(), 10000, 'timeout')
              if (profileData.is_locked) {
                await supabase.auth.signOut()
                set({ isLoading: false, isAuthenticated: false })
                return
              }
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
              })
            } catch {
              // loadProfile() needs the network — if that's what's missing
              // (not the session itself), keep the user logged in on the
              // last-known persisted profile instead of signing them out.
              // Previously this fell through to isAuthenticated: false,
              // which logged out an offline cashier who had a perfectly
              // valid cached session.
              const cached = get()
              if (cached.profile?.is_locked) {
                set({ isLoading: false, isAuthenticated: false })
              } else if (cached.profile && cached.user?.id === session.user.id) {
                set({ user: session.user, session, isAuthenticated: true, isLoading: false })
              } else {
                set({ isLoading: false, isAuthenticated: false })
              }
            }
          } else {
            set({ isLoading: false, isAuthenticated: false })
          }
        } catch {
          set({ isLoading: false, isAuthenticated: false })
        }
      },

      // Accepts either an email, or a username + its account's email
      // together — usernames are only unique within a tenant now, so a
      // bare username alone can no longer identify a single account
      // (Login.jsx collects the email alongside it whenever the typed
      // identifier isn't already email-shaped).
      signIn: async (identifier, password, usernameEmail) => {
        set({ isLoading: true })

        try {
          let email = identifier
          if (!identifier.includes('@')) {
            if (!usernameEmail) {
              set({ isLoading: false })
              throw new Error('Enter the email address linked to that username')
            }
            const { data: resolvedEmail, error: resolveErr } = await withTimeout(
              supabase.rpc('resolve_login_email', { p_username: identifier, p_email: usernameEmail }),
              15000,
              'Slow or no connection — check your network and try again',
            )
            if (resolveErr || !resolvedEmail) {
              set({ isLoading: false })
              // Same generic message a wrong password gets — never reveal
              // whether it was the username/email pairing or the password
              // that was wrong.
              throw new Error('Invalid email/username or password')
            }
            email = resolvedEmail
          }

          const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            15000,
            'Slow or no connection — check your network and try again',
          )

          if (error) {
            set({ isLoading: false })
            throw error
          }

          const profileData = await withTimeout(
            loadProfile(),
            15000,
            'Slow or no connection — check your network and try again',
          )

          if (profileData.is_locked) {
            await supabase.auth.signOut()
            set({ isLoading: false })
            throw new Error(`Account locked${profileData.locked_reason ? `: ${profileData.locked_reason}` : ''}. Contact your Super Admin to unlock it.`)
          }

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
          })
          
          return profileData.userType
        } catch (err) {
          // Offline fallback: if this is the same person who was already
          // logged in on this device, getSession() still has their token
          // locally and we already have their profile persisted from last
          // time — use that instead of re-fetching (which needs the network
          // that just failed). This only re-uses an existing valid session;
          // it never accepts a password without checking it when online.
          // The username->email resolution above needs the network too, so
          // if we're offline it never ran — match the cached profile by
          // either identifier, not just the (possibly still-unresolved) email.
          const cached = get()
          const matchesCachedIdentity = (p) => p?.email === identifier || (p?.username && p.username === identifier)
          if (matchesCachedIdentity(cached.profile) && cached.profile?.is_locked) {
            // Must escape the inner try/catch below undiluted — it exists
            // to swallow network errors and fall through to the original
            // message, but a lock is a real, user-facing reason to stop.
            set({ isLoading: false })
            throw new Error(`Account locked${cached.profile.locked_reason ? `: ${cached.profile.locked_reason}` : ''}. Contact your Super Admin to unlock it.`)
          }

          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user && matchesCachedIdentity(cached.profile) && cached.profile?.email === session.user.email) {
              set({
                user: session.user,
                session,
                profile: cached.profile,
                tenant: cached.tenant,
                role: cached.role,
                branch: cached.branch,
                userType: cached.userType,
                tenantStatus: cached.tenantStatus,
                isAuthenticated: true,
                isLoading: false,
              })
              return cached.userType
            }
          } catch (cacheErr) {
            // Cache fallback failed, continue to throw original error
          }

          set({ isLoading: false })
          throw err
        }
      },

      signUp: async (email, password, name, businessName, businessType, phone, detail = {}) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name, business_name: businessName, business_type: businessType || 'retail', phone,
              industry: detail.industry || null,
              location: detail.location || null,
              requested_branches: detail.requestedBranches || null,
              team_size_range: detail.teamSizeRange || null,
              requested_plan_pref: detail.requestedPlanPref || null,
              work_address: detail.workAddress || null,
              work_contact: detail.workContact || null,
              special_requirements: detail.specialRequirements || null,
            },
          },
        })
        if (error) throw error

        // If email confirmation is disabled Supabase returns a session immediately.
        // Load the profile (the DB trigger will have already created tenant/user/branch)
        // and set full auth state so ProtectedRoute doesn't bounce the user.
        if (data.session && data.user) {
          try {
            const profileData = await loadProfile()
            set({
              user: data.user,
              session: data.session,
              profile: profileData,
              tenant: profileData.tenants || null,
              role: profileData.role,
              branch: profileData.branch || null,
              userType: profileData.userType,
              tenantStatus: profileData.tenantStatus || 'pending',
              isAuthenticated: true,
              isLoading: false,
            })
          } catch {
            // Profile may not be ready yet in edge cases; user can sign in normally
          }
        }

        return data
      },

      clearAuth: async () => {
        await supabase.auth.signOut()
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
        })
      },

      // The other half of offline-first auth: a cashier can keep working on
      // a cached session while offline, but the moment connectivity returns
      // this quietly confirms the server still agrees with what the device
      // trusted locally. It only locks on a genuine mismatch (the session
      // token now resolves to a different identity, or the server's own
      // record disagrees with what's cached) — never for a plain network
      // failure, and never for a routine admin action that already has its
      // own handling (suspension already redirects via tenantStatus).
      validateSession: async () => {
        if (!navigator.onLine) return
        const cached = get()
        if (!cached.isAuthenticated || !cached.user) return

        try {
          const { data: { user: serverUser }, error: authErr } = await supabase.auth.getUser()
          if (authErr || !serverUser) return // couldn't reach/validate — inconclusive, not a mismatch

          if (serverUser.id !== cached.user.id) {
            // The live session token no longer resolves to the identity this
            // device has been operating as offline — a real mismatch.
            try { await supabase.rpc('lock_my_account', { p_reason: 'Session identity mismatch on background revalidation' }) } catch { /* best-effort */ }
            await get().clearAuth()
            return
          }

          const freshProfile = await loadProfile()
          if (!freshProfile) return

          if (freshProfile.is_locked) {
            // Already locked (by this check on another device, or by an
            // admin) — just sign out locally, no need to lock again.
            await get().clearAuth()
            return
          }

          if (freshProfile.email !== cached.profile?.email) {
            // The server's authoritative record for this session no longer
            // matches what was cached while offline.
            try { await supabase.rpc('lock_my_account', { p_reason: 'Account details no longer match this device\'s cached session' }) } catch { /* best-effort */ }
            await get().clearAuth()
            return
          }

          // Confirmed consistent — refresh the cached profile quietly.
          set({ profile: freshProfile })
        } catch {
          // Network/timeout mid-check — inconclusive, try again next cycle
        }
      },

      setAuth: ({ user, session, profile, tenant, role, branch }) =>
        set({ user, session, profile, tenant, role, branch, isAuthenticated: !!user, isLoading: false }),

      // Merges a partial tenant row (e.g. from a realtime UPDATE payload) into
      // the current tenant in place — so plan approvals, trial extensions, or
      // status changes made elsewhere (Super Admin, payment webhook) reach an
      // already-open session without waiting for the user to log out/in.
      updateTenant: (partialTenant) =>
        set((state) => ({ tenant: state.tenant ? { ...state.tenant, ...partialTenant } : state.tenant })),

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
      }),
    }
  )
)

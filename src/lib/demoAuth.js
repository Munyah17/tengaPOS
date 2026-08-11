import { useAuthStore, NAV_PERMISSIONS } from '@/stores/authStore'
import { useDemoStore } from '@/lib/demoStore'
import { setDemoActive, DEMO_ROLE_SESSION_KEY } from '@/lib/demoMode'
import { DEMO_TENANT, DEMO_BRANCH, DEMO_USERS } from '@/lib/demoData'

// Populates the real authStore with sandbox data for the given role --
// same fields a real login sets, so every page/component that reads
// useAuthStore() (Sidebar, TopBar, the 7 core pages, NAV_PERMISSIONS
// gating) works unmodified. `session` stays null on purpose: there is no
// real Supabase session behind a demo visit, and nothing here should ever
// need one (see dataLayer.js -- every read/write for the 7 demo-reachable
// pages is intercepted before it would reach supabase-js).
export function enterDemoMode(role = 'vendor') {
  const demoUser = DEMO_USERS[role] || DEMO_USERS.vendor
  setDemoActive(true)
  sessionStorage.setItem(DEMO_ROLE_SESSION_KEY, demoUser.role)
  useDemoStore.getState().setRole(demoUser.role)
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    userType: 'tenant_user',
    role: demoUser.role,
    user: { id: demoUser.id, email: demoUser.email },
    profile: { id: demoUser.id, name: demoUser.name, email: demoUser.email, role: demoUser.role },
    tenant: DEMO_TENANT,
    branch: DEMO_BRANCH,
    tenantStatus: 'active',
    session: null,
  })
}

// role switcher -- same effect as enterDemoMode, kept as a separate name
// at the call sites for clarity (switching identity vs. starting fresh)
export const switchDemoRole = enterDemoMode

export function firstAllowedDemoPath(role) {
  const allowed = NAV_PERMISSIONS[role] || NAV_PERMISSIONS.vendor
  return `/app/${allowed[0] || 'dashboard'}`
}

export function restoreDemoModeIfAny() {
  const role = sessionStorage.getItem(DEMO_ROLE_SESSION_KEY)
  if (!role) return false
  enterDemoMode(role)
  return true
}

export function exitDemoMode() {
  setDemoActive(false)
  sessionStorage.removeItem(DEMO_ROLE_SESSION_KEY)
  useDemoStore.getState().resetDemo()
  useAuthStore.setState({
    user: null, session: null, profile: null, tenant: null, role: null, branch: null,
    userType: null, tenantStatus: null, isAuthenticated: false, isLoading: false,
  })
}

import { create } from 'zustand'

// Whether the current tab is inside the /demo sandbox. Deliberately a flag,
// not a "does the URL start with /demo" check: the demo experience reuses
// the real /app/* route tree as-is (Sidebar/TopBar/every page already
// hardcode /app/... links -- rewriting all of them to a /demo/app prefix
// would mean forking navigation everywhere those pages happen to link to).
// /demo itself is only the entry point (onboarding + role picker); clicking
// through sets this flag and lands the visitor on the real /app/dashboard
// path, same as a real login would.
//
// Never persisted (no zustand `persist`) -- a plain reload always starts
// back at false, so a demo session can never survive into, or contaminate,
// a real one across a reload. dataLayer.js, authStore.js and AppLayout.jsx
// all key off this same flag to decide demo vs. real behaviour.
const useDemoFlag = create(() => ({ active: false }))

// Tab-scoped restore key (sessionStorage, never localStorage) -- shared by
// demoAuth.js (writes it on enter/exit) and authStore.js's initAuth (reads
// it to survive a refresh) so the string can't drift between the two.
export const DEMO_ROLE_SESSION_KEY = 'tengapos_demo_role'

export function isDemoRoute() {
  return useDemoFlag.getState().active
}

export function setDemoActive(active) {
  useDemoFlag.setState({ active })
}

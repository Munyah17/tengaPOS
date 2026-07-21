import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useEffect, lazy, Suspense } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore, NAV_PERMISSIONS } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import AdminLayout from '@/components/admin/AdminLayout'

// Route-level code splitting — each page ships as its own chunk instead of
// one ~2.5MB bundle everyone downloads before anything renders, regardless
// of which single page they actually landed on.
const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/Login'))
const StaffLogin = lazy(() => import('@/pages/StaffLogin'))
const Register = lazy(() => import('@/pages/Register'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const POS = lazy(() => import('@/pages/POS'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Orders = lazy(() => import('@/pages/Orders'))
const Kitchen = lazy(() => import('@/pages/Kitchen'))
const Transactions = lazy(() => import('@/pages/Transactions'))
const Reports = lazy(() => import('@/pages/Reports'))
const Staff = lazy(() => import('@/pages/Staff'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Branches = lazy(() => import('@/pages/Branches'))
const Fiscalisation = lazy(() => import('@/pages/Fiscalisation'))
const Settings = lazy(() => import('@/pages/Settings'))
const Insights = lazy(() => import('@/pages/Insights'))
const PaymentReturn = lazy(() => import('@/pages/PaymentReturn'))
const Payments = lazy(() => import('@/pages/Payments'))
const HR = lazy(() => import('@/pages/HR'))
const Invoicing = lazy(() => import('@/pages/Invoicing'))
const Notifications = lazy(() => import('@/pages/Notifications'))
const Requests = lazy(() => import('@/pages/Requests'))
const Dining = lazy(() => import('@/pages/Dining'))
const PendingApproval = lazy(() => import('@/pages/PendingApproval'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const SuperAdminDashboard = lazy(() => import('@/pages/admin/SuperAdminDashboard'))
const AdminTenants = lazy(() => import('@/pages/admin/AdminTenants'))
const AdminMarketing = lazy(() => import('@/pages/admin/AdminMarketing'))
const AdminStaff = lazy(() => import('@/pages/admin/AdminStaff'))
const AdminSupport = lazy(() => import('@/pages/admin/AdminSupport'))
const AdminReports = lazy(() => import('@/pages/admin/AdminReports'))
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'))
const AdminNotifications = lazy(() => import('@/pages/admin/AdminNotifications'))
const SuperAdminSubscriptions = lazy(() => import('@/pages/admin/SuperAdminSubscriptions'))
const SuperAdminBilling = lazy(() => import('@/pages/admin/SuperAdminBilling'))
const SuperAdminPricing = lazy(() => import('@/pages/admin/SuperAdminPricing'))
const SuperAdminHealth = lazy(() => import('@/pages/admin/SuperAdminHealth'))
const SuperAdminAudit = lazy(() => import('@/pages/admin/SuperAdminAudit'))
const SuperAdminCompliance = lazy(() => import('@/pages/admin/SuperAdminCompliance'))
const SuperAdminBackups = lazy(() => import('@/pages/admin/SuperAdminBackups'))
const SuperAdminRoles = lazy(() => import('@/pages/admin/SuperAdminRoles'))
const SuperAdminAnnouncements = lazy(() => import('@/pages/admin/SuperAdminAnnouncements'))
const SuperAdminBroadcasts = lazy(() => import('@/pages/admin/SuperAdminBroadcasts'))
const SuperAdminVersions = lazy(() => import('@/pages/admin/SuperAdminVersions'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminFiscalRequests = lazy(() => import('@/pages/admin/AdminFiscalRequests'))
const AdminAccountingErpRequests = lazy(() => import('@/pages/admin/AdminAccountingErpRequests'))
const AdminVatRequests = lazy(() => import('@/pages/admin/AdminVatRequests'))
const AdminAiInsightsRequests = lazy(() => import('@/pages/admin/AdminAiInsightsRequests'))
const Checkout = lazy(() => import('@/pages/Checkout'))

function RouteLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white dark:bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600 dark:border-slate-700" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function ProtectedRoute({ children }) {
  const { isAuthenticated, userType, tenantStatus, tenant } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (userType === 'app_owner') return <Navigate to="/admin/dashboard" replace />
  // 7-day trial is opt-in: fresh signups (no trial, no plan) choose on /checkout;
  // an expired trial also routes to checkout to pick a paid plan
  const onTrial = tenant?.trial_ends_at && !tenant?.plan_start_date
  const trialExpired = onTrial && new Date(tenant.trial_ends_at) <= new Date()
  const neverActivated = !tenant?.trial_ends_at && !tenant?.plan_start_date
  if (trialExpired) return <Navigate to="/checkout" replace />
  if (tenantStatus === 'pending') {
    return <Navigate to={neverActivated ? '/checkout' : '/pending'} replace />
  }
  if (tenantStatus === 'suspended') {
    // Suspended because the trial ran out → pay; suspended by Super Admin → pending screen
    return <Navigate to={onTrial ? '/checkout' : '/pending'} replace />
  }
  if (tenantStatus === 'rejected' || tenantStatus === 'stalled') {
    return <Navigate to="/pending" replace />
  }
  return children
}

function AppIndexRedirect() {
  const { role } = useAuthStore()
  const allowed = NAV_PERMISSIONS[role] || NAV_PERMISSIONS.vendor
  return <Navigate to={allowed[0] || 'dashboard'} replace />
}

// Sidebar links already hide pages a role can't use, but that's cosmetic —
// this is the actual access control: a cashier typing /app/settings in the
// URL bar must not reach it just because ProtectedRoute passed.
function RequireNav({ navKey, children }) {
  const { role } = useAuthStore()
  const allowed = NAV_PERMISSIONS[role] || NAV_PERMISSIONS.vendor
  if (!allowed.includes(navKey)) {
    return <Navigate to={`/app/${allowed[0] || 'dashboard'}`} replace />
  }
  return children
}

// Staff portals have their own sign-in pages, separate from the client
// /login: unauthenticated visitors to /admin/* land on the staff login,
// and /admin/super/* on the Super Admin one.
function AdminRoute({ children }) {
  const { isAuthenticated, userType, role } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  if (userType !== 'app_owner') return <Navigate to="/app/dashboard" replace />
  // Super Admin redirects to super admin portal
  if (role === 'super_admin') return <Navigate to="/admin/super/dashboard" replace />
  // Regular admin and others stay in regular admin
  return children
}

function SuperAdminRoute({ children }) {
  const { isAuthenticated, userType, role } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/super-admin" replace />
  if (userType !== 'app_owner') return <Navigate to="/app/dashboard" replace />
  if (role !== 'super_admin') return <Navigate to="/admin/dashboard" replace />
  return children
}

export default function App() {
  const { initTheme } = useThemeStore()
  const { initAuth } = useAuthStore()

  useEffect(() => {
    initTheme()
    initAuth()
  }, [initTheme, initAuth])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          {/* Staff sign-in — separate from client /login. /super-admin is
              Super Admin only; /admin (unauthenticated) lands here too. */}
          <Route path="/super-admin" element={<StaffLogin variant="super" />} />
          <Route path="/admin/login" element={<StaffLogin variant="staff" />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dining" element={<Dining />} />
          <Route path="/pending" element={<PendingApproval />} />
          <Route path="/checkout" element={<Checkout />} />

          {/* Tenant app routes */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AppIndexRedirect />} />
            <Route path="dashboard" element={<RequireNav navKey="dashboard"><Dashboard /></RequireNav>} />
            <Route path="pos" element={<RequireNav navKey="pos"><POS /></RequireNav>} />
            <Route path="inventory" element={<RequireNav navKey="inventory"><Inventory /></RequireNav>} />
            <Route path="orders" element={<RequireNav navKey="orders"><Orders /></RequireNav>} />
            <Route path="kitchen" element={<RequireNav navKey="kitchen"><Kitchen /></RequireNav>} />
            <Route path="transactions" element={<RequireNav navKey="transactions"><Transactions /></RequireNav>} />
            <Route path="reports" element={<RequireNav navKey="reports"><Reports /></RequireNav>} />
            <Route path="insights" element={<RequireNav navKey="insights"><Insights /></RequireNav>} />
            <Route path="payment/return" element={<PaymentReturn />} />
            <Route path="staff" element={<RequireNav navKey="staff"><Staff /></RequireNav>} />
            <Route path="tasks" element={<RequireNav navKey="tasks"><Tasks /></RequireNav>} />
            <Route path="branches" element={<RequireNav navKey="branches"><Branches /></RequireNav>} />
            <Route path="fiscalisation" element={<RequireNav navKey="fiscalisation"><Fiscalisation /></RequireNav>} />
            <Route path="payments" element={<RequireNav navKey="payments"><Payments /></RequireNav>} />
            <Route path="hr" element={<RequireNav navKey="hr"><HR /></RequireNav>} />
            <Route path="invoicing" element={<RequireNav navKey="invoicing"><Invoicing /></RequireNav>} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="requests" element={<RequireNav navKey="requests"><Requests /></RequireNav>} />
            <Route path="settings" element={<RequireNav navKey="settings"><Settings /></RequireNav>} />
          </Route>

          {/* Super Admin Portal */}
          <Route
            path="/admin/super"
            element={
              <SuperAdminRoute>
                <AdminLayout />
              </SuperAdminRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<SuperAdminDashboard />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="tenants" element={<AdminTenants />} />
            <Route path="marketing" element={<AdminMarketing />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="fiscal-requests" element={<AdminFiscalRequests />} />
            <Route path="accounting-erp-requests" element={<AdminAccountingErpRequests />} />
            <Route path="vat-requests" element={<AdminVatRequests />} />
            <Route path="ai-insights-requests" element={<AdminAiInsightsRequests />} />
            <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
            <Route path="billing" element={<SuperAdminBilling />} />
            <Route path="pricing" element={<SuperAdminPricing />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="roles" element={<SuperAdminRoles />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="announcements" element={<SuperAdminAnnouncements />} />
            <Route path="broadcasts" element={<SuperAdminBroadcasts />} />
            <Route path="versions" element={<SuperAdminVersions />} />
            <Route path="audit-logs" element={<SuperAdminAudit />} />
            <Route path="compliance" element={<SuperAdminCompliance />} />
            <Route path="backups" element={<SuperAdminBackups />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="health" element={<SuperAdminHealth />} />
          </Route>

          {/* Admin Panel (Staff Operations) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="marketing" element={<AdminMarketing />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="fiscal-requests" element={<AdminFiscalRequests />} />
            <Route path="accounting-erp-requests" element={<AdminAccountingErpRequests />} />
            <Route path="vat-requests" element={<AdminVatRequests />} />
            <Route path="ai-insights-requests" element={<AdminAiInsightsRequests />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="announcements" element={<SuperAdminAnnouncements />} />
            <Route path="versions" element={<SuperAdminVersions />} />
            <Route path="pricing" element={<SuperAdminPricing />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminSettings />} />
            <Route path="notifications" element={<AdminNotifications />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '12px',
            background: '#1e293b',
            color: '#fff',
            fontSize: '14px',
          },
        }}
      />
    </QueryClientProvider>
  )
}

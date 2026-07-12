import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import POS from '@/pages/POS'
import Inventory from '@/pages/Inventory'
import Orders from '@/pages/Orders'
import Kitchen from '@/pages/Kitchen'
import Transactions from '@/pages/Transactions'
import Reports from '@/pages/Reports'
import Staff from '@/pages/Staff'
import Tasks from '@/pages/Tasks'
import Branches from '@/pages/Branches'
import Fiscalisation from '@/pages/Fiscalisation'
import Settings from '@/pages/Settings'
import Insights from '@/pages/Insights'
import PaymentReturn from '@/pages/PaymentReturn'
import Payments from '@/pages/Payments'
import HR from '@/pages/HR'
import Notifications from '@/pages/Notifications'
import AppLayout from '@/components/layout/AppLayout'

import Dining from '@/pages/Dining'
import PendingApproval from '@/pages/PendingApproval'
import AdminLayout from '@/components/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import SuperAdminDashboard from '@/pages/admin/SuperAdminDashboard'
import AdminTenants from '@/pages/admin/AdminTenants'
import AdminStaff from '@/pages/admin/AdminStaff'
import AdminSupport from '@/pages/admin/AdminSupport'
import AdminReports from '@/pages/admin/AdminReports'
import AdminSettings from '@/pages/admin/AdminSettings'
import AdminNotifications from '@/pages/admin/AdminNotifications'
import SuperAdminSubscriptions from '@/pages/admin/SuperAdminSubscriptions'
import SuperAdminBilling from '@/pages/admin/SuperAdminBilling'
import SuperAdminPricing from '@/pages/admin/SuperAdminPricing'
import SuperAdminHealth from '@/pages/admin/SuperAdminHealth'
import SuperAdminAudit from '@/pages/admin/SuperAdminAudit'
import SuperAdminCompliance from '@/pages/admin/SuperAdminCompliance'
import SuperAdminBackups from '@/pages/admin/SuperAdminBackups'
import SuperAdminRoles from '@/pages/admin/SuperAdminRoles'
import SuperAdminAnnouncements from '@/pages/admin/SuperAdminAnnouncements'
import SuperAdminBroadcasts from '@/pages/admin/SuperAdminBroadcasts'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminFiscalRequests from '@/pages/admin/AdminFiscalRequests'
import Checkout from '@/pages/Checkout'

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
  return children
}

function AdminRoute({ children }) {
  const { isAuthenticated, userType, role } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (userType !== 'app_owner') return <Navigate to="/app/dashboard" replace />
  // Super Admin redirects to super admin portal
  if (role === 'super_admin') return <Navigate to="/admin/super/dashboard" replace />
  // Regular admin and others stay in regular admin
  return children
}

function SuperAdminRoute({ children }) {
  const { isAuthenticated, userType, role } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
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
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<POS />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="orders" element={<Orders />} />
            <Route path="kitchen" element={<Kitchen />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="insights" element={<Insights />} />
            <Route path="payment/return" element={<PaymentReturn />} />
            <Route path="staff" element={<Staff />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="branches" element={<Branches />} />
            <Route path="fiscalisation" element={<Fiscalisation />} />
            <Route path="payments" element={<Payments />} />
            <Route path="hr" element={<HR />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
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
            <Route path="users" element={<AdminUsers />} />
            <Route path="fiscal-requests" element={<AdminFiscalRequests />} />
            <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
            <Route path="billing" element={<SuperAdminBilling />} />
            <Route path="pricing" element={<SuperAdminPricing />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="roles" element={<SuperAdminRoles />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="announcements" element={<SuperAdminAnnouncements />} />
            <Route path="broadcasts" element={<SuperAdminBroadcasts />} />
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
            <Route path="users" element={<AdminUsers />} />
            <Route path="fiscal-requests" element={<AdminFiscalRequests />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="announcements" element={<SuperAdminAnnouncements />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminSettings />} />
            <Route path="notifications" element={<AdminNotifications />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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

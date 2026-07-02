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
import AppLayout from '@/components/layout/AppLayout'

import Dining from '@/pages/Dining'
import PendingApproval from '@/pages/PendingApproval'
import AdminLayout from '@/components/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminTenants from '@/pages/admin/AdminTenants'
import AdminStaff from '@/pages/admin/AdminStaff'
import AdminSupport from '@/pages/admin/AdminSupport'
import AdminReports from '@/pages/admin/AdminReports'
import AdminSettings from '@/pages/admin/AdminSettings'
import AdminNotifications from '@/pages/admin/AdminNotifications'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function ProtectedRoute({ children }) {
  const { isAuthenticated, userType, tenantStatus, isDemo } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Demo users are NEVER redirected to /admin — they stay in the tenant app always
  if (!isDemo && userType === 'app_owner') return <Navigate to="/admin/dashboard" replace />
  if (!isDemo && tenantStatus === 'pending') return <Navigate to="/pending" replace />
  if (!isDemo && tenantStatus === 'suspended') return <Navigate to="/pending" replace />
  return children
}

function AdminRoute({ children }) {
  const { isAuthenticated, userType, isDemo } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Demo users cannot access the admin panel under any circumstances
  if (isDemo || userType !== 'app_owner') return <Navigate to="/app/dashboard" replace />
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
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Admin panel routes */}
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
            <Route path="tenants" element={<AdminTenants />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
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

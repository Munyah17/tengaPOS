// Real, tenant-specific notifications — low stock alerts, kitchen orders
// ready to serve, and platform announcements. Shared by TopBar and the
// full Notifications page so the two never drift out of sync.
import { useState, useEffect, useCallback } from 'react'
import { Package, UtensilsCrossed, Megaphone, Inbox } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const READ_KEY = 'tengapos_notifications_read'
function getReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')) } catch { return new Set() }
}
function saveReadIds(ids) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
}

// Platform-wide announcements (trial reminders, product updates, etc.) are
// operator/management noise for front-of-house staff — cashiers and shop
// assistants only need what affects the till: low stock and ready orders.
const ANNOUNCEMENTS_HIDDEN_FOR = ['cashier', 'shop_assistant']

export function useTenantNotifications({ tenantId, posMode, role, limit = 20, pollMs = 60000 } = {}) {
  const [notifications, setNotifications] = useState([])

  const load = useCallback(async () => {
    if (!tenantId) return
    const readIds = getReadIds()
    const includeAnnouncements = !ANNOUNCEMENTS_HIDDEN_FOR.includes(role)
    const [{ data: products }, { data: readyOrders }, { data: announcements }] = await Promise.all([
      supabase.from('products').select('id, name, stock_qty, low_stock_threshold, updated_at').eq('tenant_id', tenantId).eq('is_active', true),
      posMode === 'restaurant'
        ? supabase.from('orders').select('id, order_no, updated_at').eq('tenant_id', tenantId).eq('status', 'ready').order('updated_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      includeAnnouncements
        ? supabase.from('announcements').select('id, title, body, created_at').eq('is_published', true).order('created_at', { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
    ])

    // Vendors also get a bell entry for approvals waiting on them — cheap
    // head-only counts, not full fetches, since this polls every minute.
    let pendingApprovals = 0
    if (role === 'vendor') {
      const counts = await Promise.all([
        supabase.from('receipt_configs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('pending_approval', true),
        supabase.from('voids').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['requested', 'approved']),
        supabase.from('returns').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['requested', 'approved']),
        supabase.from('payment_sessions').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['pending', 'awaiting_delivery']),
      ]).catch(() => [])
      pendingApprovals = (counts || []).reduce((s, r) => s + (r?.count || 0), 0)
    }

    const lowStock = (products || [])
      .filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 10))
      .map((p) => ({
        id: `stock-${p.id}`,
        text: `Low stock: ${p.name} (${p.stock_qty} left)`,
        time: timeAgo(p.updated_at),
        ts: p.updated_at,
        icon: Package,
      }))

    const orderNotes = (readyOrders || []).map((o) => ({
      id: `order-${o.id}`,
      text: `Order ${o.order_no} ready to serve`,
      time: timeAgo(o.updated_at),
      ts: o.updated_at,
      icon: UtensilsCrossed,
    }))

    const announcementNotes = (announcements || []).map((a) => ({
      id: `announce-${a.id}`,
      text: a.title,
      body: a.body,
      time: timeAgo(a.created_at),
      ts: a.created_at,
      icon: Megaphone,
    }))

    const approvalNotes = pendingApprovals > 0 ? [{
      // Keyed by count so a NEW request re-flags unread even if an earlier
      // batch was marked read
      id: `requests-${pendingApprovals}`,
      text: `${pendingApprovals} approval${pendingApprovals !== 1 ? 's' : ''} waiting for you — open Requests`,
      time: 'now',
      ts: new Date().toISOString(),
      icon: Inbox,
    }] : []

    const all = [...approvalNotes, ...lowStock, ...orderNotes, ...announcementNotes]
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, limit)
      .map((n) => ({ ...n, unread: !readIds.has(n.id) }))

    setNotifications(all)
  }, [tenantId, posMode, role, limit])

  useEffect(() => {
    load()
    const interval = setInterval(load, pollMs)
    return () => clearInterval(interval)
  }, [load, pollMs])

  const markAllRead = () => {
    setNotifications((prev) => {
      const ids = getReadIds()
      prev.forEach((n) => ids.add(n.id))
      saveReadIds(ids)
      return prev.map((n) => ({ ...n, unread: false }))
    })
  }

  const markRead = (id) => {
    setNotifications((prev) => {
      const ids = getReadIds()
      ids.add(id)
      saveReadIds(ids)
      return prev.map((n) => n.id === id ? { ...n, unread: false } : n)
    })
  }

  return { notifications, markAllRead, markRead, reload: load }
}

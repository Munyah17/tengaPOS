// Real, tenant-specific notifications — low stock alerts, kitchen orders
// ready to serve, and platform announcements. Shared by TopBar and the
// full Notifications page so the two never drift out of sync.
import { useState, useEffect, useCallback } from 'react'
import { Package, UtensilsCrossed, Megaphone } from 'lucide-react'
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

export function useTenantNotifications({ tenantId, posMode, limit = 20, pollMs = 60000 } = {}) {
  const [notifications, setNotifications] = useState([])

  const load = useCallback(async () => {
    if (!tenantId) return
    const readIds = getReadIds()
    const [{ data: products }, { data: readyOrders }, { data: announcements }] = await Promise.all([
      supabase.from('products').select('id, name, stock_qty, low_stock_threshold, updated_at').eq('tenant_id', tenantId).eq('is_active', true),
      posMode === 'restaurant'
        ? supabase.from('orders').select('id, order_no, updated_at').eq('tenant_id', tenantId).eq('status', 'ready').order('updated_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      supabase.from('announcements').select('id, title, body, created_at').eq('is_published', true).order('created_at', { ascending: false }).limit(5),
    ])

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

    const all = [...lowStock, ...orderNotes, ...announcementNotes]
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, limit)
      .map((n) => ({ ...n, unread: !readIds.has(n.id) }))

    setNotifications(all)
  }, [tenantId, posMode, limit])

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

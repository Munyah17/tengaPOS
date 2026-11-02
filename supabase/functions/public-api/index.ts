// tengaPOS Public API — authenticates developer/integration keys issued by
// the Super Admin and serves tenant-scoped REST resources under /v1/*.
//
// Auth:  Authorization: Bearer <key>   (or X-API-Key: <key>)
//        publishable keys (tpos_pk_...) — client-safe, read-only catalogue
//        endpoints only (account, branches, categories, products, stock).
//        integration keys (tpos_sk_...) — server-side secret; access is
//        limited to the scopes granted at issuance.
//
// Keys are stored only as SHA-256 hashes in public.api_keys; we hash the
// presented key and compare. Every request is logged to
// public.api_request_logs, which also powers per-key rate limiting.
//
// Deploy with: supabase functions deploy public-api --no-verify-jwt
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Scopes a publishable key may ever exercise, regardless of what was
// granted at issuance — catalogue-style public reads only.
const PUBLISHABLE_SCOPES = new Set([
  'account:read', 'branches:read', 'categories:read', 'products:read', 'stock:read',
])

const ALL_SCOPES = new Set([
  ...PUBLISHABLE_SCOPES,
  'customers:read', 'customers:write',
  'sales:read', 'orders:read', 'orders:write',
  'invoices:read', 'invoices:write',
])

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

interface ApiKey {
  id: string
  tenant_id: string
  key_type: 'publishable' | 'integration'
  scopes: string[]
  rate_limit_per_minute: number
  allowed_origins: string[] | null
  status: string
  expires_at: string | null
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function apiError(code: string, message: string, status: number, headers: Record<string, string> = {}) {
  return json({ error: { code, message } }, status, headers)
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hasScope(key: ApiKey, scope: string): boolean {
  if (key.key_type === 'publishable') {
    // Publishable keys are hard-capped to the safe public scope set.
    return PUBLISHABLE_SCOPES.has(scope) && (key.scopes.includes(scope) || key.scopes.length === 0)
  }
  return key.scopes.includes(scope) || key.scopes.includes('*')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  // Path arrives as /functions/v1/public-api/<...>; take what follows.
  const fnIdx = url.pathname.indexOf('/public-api')
  const path = (fnIdx >= 0 ? url.pathname.slice(fnIdx + '/public-api'.length) : url.pathname) || '/'
  const segments = path.split('/').filter(Boolean) // e.g. ['v1','products','<id>']

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Unversioned root: small discovery payload ──
  if (segments.length === 0) {
    return json({ name: 'tengaPOS Public API', version: 'v1', docs: '/developers' })
  }
  if (segments[0] !== 'v1') return apiError('not_found', 'Unknown API version. Use /v1/…', 404)

  // ── Authenticate ──
  const presented =
    (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.headers.get('X-API-Key') || '').trim()
  if (!presented || !/^tpos_(pk|sk)_/.test(presented)) {
    return apiError('unauthorized', 'Missing or malformed API key. Pass it as "Authorization: Bearer <key>".', 401)
  }

  const keyHash = await sha256hex(presented)
  const { data: key } = await admin
    .from('api_keys')
    .select('id, tenant_id, key_type, scopes, rate_limit_per_minute, allowed_origins, status, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (!key) return apiError('unauthorized', 'Invalid API key.', 401)
  if (key.status !== 'active') return apiError('unauthorized', 'This API key has been revoked.', 401)
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return apiError('unauthorized', 'This API key has expired.', 401)
  }

  // Publishable keys may declare an Origin allowlist for browser use.
  const origin = req.headers.get('Origin')
  if (key.key_type === 'publishable' && key.allowed_origins?.length && origin && !key.allowed_origins.includes(origin)) {
    return apiError('forbidden', 'Origin is not allowlisted for this publishable key.', 403)
  }

  // ── Rate limit: requests in the rolling last 60s ──
  const windowStart = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('api_request_logs')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', key.id)
    .gte('created_at', windowStart)
  const rlHeaders = {
    'X-RateLimit-Limit': String(key.rate_limit_per_minute),
    'X-RateLimit-Remaining': String(Math.max(0, key.rate_limit_per_minute - (recent ?? 0) - 1)),
    'X-RateLimit-Reset': '60',
  }
  if ((recent ?? 0) >= key.rate_limit_per_minute) {
    return apiError('rate_limited', `Rate limit of ${key.rate_limit_per_minute} requests/minute exceeded.`, 429, rlHeaders)
  }

  // ── Dispatch ──
  const finish = (res: Response) => {
    // Fire-and-forget bookkeeping: usage log + last_used_at.
    const log = admin.from('api_request_logs').insert({
      api_key_id: key.id,
      tenant_id: key.tenant_id,
      method: req.method,
      path,
      status_code: res.status,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    })
    const touch = admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
    Promise.all([log, touch]).catch(() => {})
    return res
  }

  try {
    const res = await route(req, admin, key, segments, url.searchParams, rlHeaders)
    return finish(res)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return finish(apiError('internal_error', msg, 500, rlHeaders))
  }
})

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────
async function route(
  req: Request,
  admin: ReturnType<typeof createClient>,
  key: ApiKey,
  segments: string[],
  params: URLSearchParams,
  rlHeaders: Record<string, string>,
): Promise<Response> {
  const resource = segments[1] || ''
  const id = segments[2] || null
  const tenantId = key.tenant_id

  const limit = Math.min(Math.max(1, parseInt(params.get('limit') || '') || DEFAULT_LIMIT), MAX_LIMIT)
  const offset = Math.max(0, parseInt(params.get('offset') || '') || 0)
  const meta = (count: number | null) => ({ meta: { limit, offset, count: count ?? undefined } })

  const list = async (
    table: string,
    scope: string,
    build: (q: ReturnType<ReturnType<typeof admin.from>['select']>) => typeof q = (q) => q,
    orderCol = 'created_at',
  ) => {
    if (!hasScope(key, scope)) return apiError('forbidden', `Missing required scope: ${scope}`, 403, rlHeaders)
    if (req.method !== 'GET') return apiError('method_not_allowed', `${req.method} not allowed on /v1/${resource}`, 405, rlHeaders)
    let q = admin.from(table).select('*', { count: 'exact' }).eq('tenant_id', tenantId)
    q = build(q)
    q = q.order(orderCol, { ascending: false }).range(offset, offset + limit - 1)
    const { data, error, count } = await q
    if (error) return apiError('query_failed', error.message, 400, rlHeaders)
    return json({ data, ...meta(count) }, 200, rlHeaders)
  }

  const one = async (table: string, scope: string, rowId: string, extra?: (q: ReturnType<ReturnType<typeof admin.from>['select']>) => typeof q) => {
    if (!hasScope(key, scope)) return apiError('forbidden', `Missing required scope: ${scope}`, 403, rlHeaders)
    if (req.method !== 'GET') return apiError('method_not_allowed', `${req.method} not allowed`, 405, rlHeaders)
    let q = admin.from(table).select('*').eq('tenant_id', tenantId).eq('id', rowId)
    if (extra) q = extra(q)
    const { data, error } = await q.maybeSingle()
    if (error) return apiError('query_failed', error.message, 400, rlHeaders)
    if (!data) return apiError('not_found', `${resource} not found`, 404, rlHeaders)
    return json({ data }, 200, rlHeaders)
  }

  const dateRange = (q: ReturnType<ReturnType<typeof admin.from>['select']>) => {
    const from = params.get('from')
    const to = params.get('to')
    const since = params.get('updated_since')
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    if (since) q = q.gte('updated_at', since)
    return q
  }

  switch (resource) {
    case 'account': {
      if (!hasScope(key, 'account:read')) return apiError('forbidden', 'Missing required scope: account:read', 403, rlHeaders)
      const { data } = await admin
        .from('tenants')
        .select('id, name, slug, currency, pos_mode, plan_type')
        .eq('id', tenantId)
        .maybeSingle()
      return json({ data }, 200, rlHeaders)
    }

    case 'branches': {
      if (id) return one('branches', 'branches:read', id)
      return list('branches', 'branches:read', (q) => q.is('deleted_at', null))
    }

    case 'categories': {
      if (id) return one('categories', 'categories:read', id)
      return list('categories', 'categories:read')
    }

    case 'products': {
      if (id) return one('products', 'products:read', id)
      return list('products', 'products:read', (q) => {
        q = dateRange(q)
        const branch = params.get('branch_id')
        const search = params.get('search')
        const category = params.get('category_id')
        if (branch) q = q.eq('branch_id', branch)
        if (category) q = q.eq('category_id', category)
        if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`)
        return q
      })
    }

    case 'stock': {
      // Stock-per-branch view for the tenant's catalogue.
      if (!hasScope(key, 'stock:read')) return apiError('forbidden', 'Missing required scope: stock:read', 403, rlHeaders)
      let q = admin.from('products').select('id, name, sku, barcode, stock_qty, branch_id', { count: 'exact' }).eq('tenant_id', tenantId)
      const branch = params.get('branch_id')
      if (branch) q = q.eq('branch_id', branch)
      const { data, error, count } = await q.order('name').range(offset, offset + limit - 1)
      if (error) return apiError('query_failed', error.message, 400, rlHeaders)
      return json({ data, ...meta(count) }, 200, rlHeaders)
    }

    case 'customers': {
      if (req.method === 'POST') {
        if (!hasScope(key, 'customers:write')) return apiError('forbidden', 'Missing required scope: customers:write', 403, rlHeaders)
        const body = await req.json().catch(() => null)
        if (!body?.name) return apiError('invalid_request', 'Body must include "name".', 400, rlHeaders)
        const { data, error } = await admin.from('customers').insert({
          tenant_id: tenantId,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
          notes: body.notes ?? null,
        }).select('*').single()
        if (error) return apiError('query_failed', error.message, 400, rlHeaders)
        return json({ data }, 201, rlHeaders)
      }
      if (id) return one('customers', 'customers:read', id)
      return list('customers', 'customers:read', (q) => {
        const search = params.get('search')
        if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
        return q.is('deleted_at', null)
      })
    }

    case 'sales': {
      // POS receipts/transactions.
      if (id) return one('transactions', 'sales:read', id)
      return list('transactions', 'sales:read', (q) => {
        q = dateRange(q)
        const branch = params.get('branch_id')
        if (branch) q = q.eq('branch_id', branch)
        return q.is('archived_at', null)
      })
    }

    case 'orders': {
      if (id) {
        // Include line items alongside the order row.
        if (!hasScope(key, 'orders:read')) return apiError('forbidden', 'Missing required scope: orders:read', 403, rlHeaders)
        const [{ data: order, error }, { data: items }] = await Promise.all([
          admin.from('orders').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle(),
          admin.from('order_items').select('*').eq('order_id', id),
        ])
        if (error) return apiError('query_failed', error.message, 400, rlHeaders)
        if (!order) return apiError('not_found', 'order not found', 404, rlHeaders)
        return json({ data: { ...order, items: items ?? [] } }, 200, rlHeaders)
      }
      return list('orders', 'orders:read', (q) => {
        q = dateRange(q)
        const branch = params.get('branch_id')
        const status = params.get('status')
        if (branch) q = q.eq('branch_id', branch)
        if (status) q = q.eq('status', status)
        return q
      })
    }

    case 'invoices':
    case 'quotations': {
      const docType = resource === 'invoices' ? 'invoice' : 'quotation'
      const scope = `invoices:${req.method === 'GET' ? 'read' : 'write'}`
      if (req.method === 'POST' && resource === 'invoices') {
        if (!hasScope(key, 'invoices:write')) return apiError('forbidden', 'Missing required scope: invoices:write', 403, rlHeaders)
        const body = await req.json().catch(() => null)
        if (!body?.customer_name || !Array.isArray(body?.items)) {
          return apiError('invalid_request', 'Body must include "customer_name" and an "items" array.', 400, rlHeaders)
        }
        const docNumber = body.doc_number || `API-${Date.now()}`
        const { data, error } = await admin.from('documents').insert({
          tenant_id: tenantId,
          branch_id: body.branch_id ?? null,
          doc_type: 'invoice',
          doc_number: docNumber,
          status: 'draft',
          customer_name: body.customer_name,
          customer_email: body.customer_email ?? null,
          customer_phone: body.customer_phone ?? null,
          customer_address: body.customer_address ?? null,
          items: body.items,
          subtotal: body.subtotal ?? 0,
          vat_amount: body.vat_amount ?? 0,
          total: body.total ?? 0,
          notes: body.notes ?? null,
          due_date: body.due_date ?? null,
        }).select('*').single()
        if (error) return apiError('query_failed', error.message, 400, rlHeaders)
        return json({ data }, 201, rlHeaders)
      }
      if (id) return one('documents', 'invoices:read', id, (q) => q.eq('doc_type', docType))
      void scope
      return list('documents', 'invoices:read', (q) => {
        q = q.eq('doc_type', docType)
        const status = params.get('status')
        if (status) q = q.eq('status', status)
        return dateRange(q)
      })
    }

    case 'scopes': {
      // Introspection: which scopes this key can actually exercise.
      const effective = [...ALL_SCOPES].filter((s) => hasScope(key, s))
      return json({ data: { key_type: key.key_type, scopes: effective } }, 200, rlHeaders)
    }

    default:
      return apiError('not_found', `Unknown resource: /v1/${resource}`, 404, rlHeaders)
  }
}

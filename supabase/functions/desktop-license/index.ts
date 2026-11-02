// TengaPOS Desktop — licensing + update delivery API (v1).
// Implements docs/desktop-license-api-v1.md.
//
// Deploy:  supabase functions deploy desktop-license --no-verify-jwt
// Secrets: DESKTOP_LICENSE_PRIVATE_KEY  (base64 Ed25519 32-byte seed)
//          -- generate once, e.g.:
//          deno eval 'import * as ed from "npm:@noble/ed25519"; console.log(btoa(String.fromCharCode(...ed.utils.randomPrivateKey())))'
//          The derived public key is served at GET /v1/meta for embedding
//          in desktop builds. The private key NEVER leaves this secret.
//
// Routes (prefix /v1):
//   POST   /activation-codes            tenant admin — issue one-time code
//   GET    /activation-codes            tenant admin — list own codes
//   DELETE /activation-codes/:id        tenant admin — revoke pending code
//   POST   /activate                    public     — consume code, bind device pubkey, issue lease
//   POST   /checkin                     device     — heartbeat + lease renewal + revoke signal
//   GET    /devices                     tenant admin — list own devices
//   POST   /devices/:id/revoke          tenant admin
//   POST   /devices/:id/unrevoke        tenant admin
//   POST   /deactivate                  device     — self-deregister, frees seat
//   GET    /releases/latest             device     — signed update manifest / up_to_date
//   GET    /download                    public     — 302 → signed installer URL
//   GET    /download/info               public     — installer metadata JSON
//   GET    /releases                    super admin
//   POST   /releases                    super admin
//   PATCH  /releases/:id                super admin
//   GET    /meta                        public     — api version, server pubkey, lease terms

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as ed from 'https://esm.sh/@noble/ed25519@2.1.0'
import {
  canonicalize, semverCmp, rolloutBucket, generateCode,
  sha256hex, b64encode, b64decode, hexToB64,
} from '../_shared/license-utils.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id, x-device-signature, x-device-timestamp',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const LEASE_DAYS = 30
const GRACE_DAYS = 14
const CODE_TTL_MINUTES = 15
const KEY_ID = 'v1'
const BUCKET = 'desktop-releases'
const SIGNED_URL_TTL = 300 // 5 min

// D4 — max desktop devices per plan_type
const DEVICE_LIMITS: Record<string, number> = {
  byod_monthly: 1,
  standard_plan: 2,
  pro_package: 3,
  business: 5,
  enterprise: 10,
}
const DEFAULT_DEVICE_LIMIT = 1

// ─── helpers ──────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(code: string, message: string, status: number, retryable = false) {
  return json({ error: { code, message, retryable } }, status)
}

async function privateKey(): Promise<Uint8Array> {
  const k = Deno.env.get('DESKTOP_LICENSE_PRIVATE_KEY')
  if (!k) throw new Error('DESKTOP_LICENSE_PRIVATE_KEY secret is not set')
  return b64decode(k)
}
async function publicKeyB64(): Promise<string> {
  return b64encode(await ed.getPublicKeyAsync(await privateKey()))
}
async function sign(payload: Record<string, unknown>): Promise<string> {
  const msg = new TextEncoder().encode(canonicalize(payload))
  return b64encode(await ed.signAsync(msg, await privateKey()))
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip') || '') || ''
}

// Fire-and-forget security logging — never lets logging break a request
// (contract §2.9: detection is best-effort, sales-critical paths come first)
async function logEvent(
  admin: ReturnType<typeof adminClient>,
  e: { type: string; device_id?: string | null; tenant_id?: string | null; detail?: Record<string, unknown>; ip?: string | null },
) {
  try {
    await admin.from('desktop_license_events').insert({
      type: e.type, device_id: e.device_id || null,
      tenant_id: e.tenant_id || null, detail: e.detail || {}, ip: e.ip || null,
    })
  } catch { /* logging must never break the request path */ }
}

// Caller = authenticated tenant member allowed to manage terminals.
async function callerTenant(req: Request, admin: ReturnType<typeof adminClient>) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data: { user }, error } = await admin.auth.getUser(jwt)
  if (error || !user) return null
  const { data: member } = await admin
    .from('users')
    .select('id, tenant_id, role')
    .eq('id', user.id)
    .maybeSingle()
  if (member && ['vendor', 'shop_manager'].includes(member.role)) return member
  const { data: staff } = await admin
    .from('app_users')
    .select('id, role')
    .eq('id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (staff) return { id: user.id, tenant_id: null, role: 'staff', staff_role: staff.role }
  return null
}

async function isSuperAdmin(req: Request, admin: ReturnType<typeof adminClient>): Promise<boolean> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return false
  const { data } = await admin
    .from('app_users')
    .select('role')
    .eq('id', user.id)
    .eq('role', 'super_admin')
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}

// Device auth per contract §1: Ed25519 sig over METHOD\nPATH\nTS\nSHA256(body)
async function deviceFromSignature(
  req: Request,
  path: string,
  bodyText: string,
  admin: ReturnType<typeof adminClient>,
) {
  const deviceId = req.headers.get('x-device-id')
  const sigB64 = req.headers.get('x-device-signature')
  const ts = req.headers.get('x-device-timestamp')
  if (!deviceId || !sigB64 || !ts) return null
  const skew = Math.abs(Date.now() - Date.parse(ts))
  if (!isFinite(skew) || skew > 5 * 60 * 1000) return null

  const { data: device } = await admin
    .from('desktop_devices')
    .select('*')
    .eq('id', deviceId)
    .maybeSingle()
  if (!device) return null

  const signed = `${req.method}\n${path}\n${ts}\n${await sha256b64(bodyText)}`
  let ok = false
  try {
    ok = await ed.verifyAsync(b64decode(sigB64), new TextEncoder().encode(signed), b64decode(device.public_key))
  } catch { ok = false }
  if (!ok) {
    await logEvent(admin, {
      type: 'signature_fail', device_id: device.id, tenant_id: device.tenant_id,
      detail: { path, claimed_device_id: deviceId }, ip: clientIp(req),
    })
  }
  return ok ? device : null
}

const DESKTOP_LICENSE_PRICE_USD = 150 // once-off, contract §2.2b — server-set only

async function entitlementsFor(
  admin: ReturnType<typeof adminClient>,
  tenant: Record<string, unknown>,
) {
  const plan = (tenant.plan_type as string) || null
  const hasPaidPlan = tenant.plan_start_date != null
  const { count: paidSeats } = await admin
    .from('desktop_license_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id).eq('status', 'paid')
  const seats = paidSeats || 0
  return {
    plan,
    license_type: hasPaidPlan ? 'subscription' : seats > 0 ? 'perpetual' : 'none',
    // D1 (revised): subscription seats + paid once-off purchases stack
    max_devices: (hasPaidPlan ? (DEVICE_LIMITS[plan || ''] ?? DEFAULT_DEVICE_LIMIT) : 0) + seats,
    modules: ['core_pos', 'inventory', 'reports'],
    features: {
      offline_sales: true,
      receipt_printing: true,
      local_users: true,
      ...(typeof tenant.features === 'object' && tenant.features ? tenant.features as object : {}),
    },
    plan_expires_at: (tenant.next_renewal_date as string) || (tenant.trial_ends_at as string) || null,
  }
}

// D1 (revised): paid plan that started OR a paid once-off desktop purchase.
async function hasDesktopLicense(
  admin: ReturnType<typeof adminClient>,
  tenant: Record<string, unknown> | null,
): Promise<boolean> {
  if (!tenant || tenant.status === 'suspended') return false
  if (tenant.plan_start_date) return true
  const { count } = await admin.from('desktop_license_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id).eq('status', 'paid')
  return (count || 0) > 0
}

async function issueLease(
  admin: ReturnType<typeof adminClient>,
  device: Record<string, unknown>,
  tenant: Record<string, unknown>,
  reason: 'activation' | 'renewal' | 'reissue',
) {
  const now = new Date()
  const expires = new Date(now.getTime() + LEASE_DAYS * 86400e3)
  const grace = new Date(expires.getTime() + GRACE_DAYS * 86400e3)
  const unsigned = {
    lease_version: 1,
    lease_id: crypto.randomUUID(),
    device_id: device.id,
    tenant_id: tenant.id,
    device_public_key_fingerprint: device.public_key_fingerprint,
    entitlements: await entitlementsFor(admin, tenant),
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    grace_until: grace.toISOString(),
    key_id: KEY_ID,
  }
  const lease = { ...unsigned, signature: await sign(unsigned) }
  await admin.from('desktop_leases').insert({
    device_id: device.id, tenant_id: tenant.id, payload: lease,
    key_id: KEY_ID, issued_at: unsigned.issued_at,
    expires_at: unsigned.expires_at, grace_until: unsigned.grace_until, reason,
  })
  await admin.from('desktop_devices').update({
    lease_expires_at: unsigned.expires_at,
    grace_until: unsigned.grace_until,
    updated_at: now.toISOString(),
  }).eq('id', device.id as string)
  return lease
}

// ─── routes ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = adminClient()
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/functions\/v1\/desktop-license/, '') || '/'
  const bodyText = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text()
  const body = bodyText ? JSON.parse(bodyText) : {}
  const now = new Date().toISOString()

  try {
    // ══════════ PUBLIC ══════════

    if (path === '/v1/meta' && req.method === 'GET') {
      return json({
        api_version: 1,
        server_public_key: await publicKeyB64(),
        key_id: KEY_ID,
        channels: ['stable', 'beta'],
        lease_days: LEASE_DAYS,
        grace_days: GRACE_DAYS,
        server_time: now,
      })
    }

    if (path === '/v1/activate' && req.method === 'POST') {
      const { code, device_name, device_public_key, device_fingerprint, app_version, os } = body
      if (!code || !device_public_key) return err('bad_request', 'code and device_public_key are required', 400)
      try { ed.etc.bytesToHex(b64decode(device_public_key)); if (b64decode(device_public_key).length !== 32) throw 0 }
      catch { return err('bad_request', 'device_public_key must be a base64 Ed25519 key', 400) }

      const codeHash = await sha256hex(String(code).trim().toUpperCase())
      const { data: codeRow } = await admin
        .from('desktop_activation_codes')
        .select('*')
        .eq('code_hash', codeHash)
        .maybeSingle()
      if (!codeRow) {
        await logEvent(admin, { type: 'activation_failed', detail: { reason: 'code_unknown', code_hint: String(code).slice(-4) }, ip: clientIp(req) })
        return err('code_unknown', 'Unknown activation code', 404)
      }
      if (codeRow.status !== 'pending') {
        await logEvent(admin, { type: 'activation_failed', tenant_id: codeRow.tenant_id, detail: { reason: `code_${codeRow.status}`, code_id: codeRow.id }, ip: clientIp(req) })
        return err('code_consumed', 'This activation code has already been used or revoked', 410)
      }
      if (new Date(codeRow.expires_at) < new Date()) {
        await logEvent(admin, { type: 'activation_failed', tenant_id: codeRow.tenant_id, detail: { reason: 'code_expired', code_id: codeRow.id }, ip: clientIp(req) })
        return err('code_expired', 'This activation code has expired', 410)
      }

      const { data: tenant } = await admin.from('tenants').select('*').eq('id', codeRow.tenant_id).single()
      if (!tenant || ['suspended', 'deleted', 'rejected'].includes(tenant.status)) {
        return err('tenant_inactive', 'This business account is not active', 403)
      }
      // D1 (revised): a started paid plan OR a paid once-off license purchase
      if (!(await hasDesktopLicense(admin, tenant))) {
        return err('license_required', 'Desktop requires a paid plan or a purchased desktop license', 403)
      }
      const ents = await entitlementsFor(admin, tenant)
      const { count: deviceCount } = await admin
        .from('desktop_devices')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
      if ((deviceCount || 0) >= ents.max_devices) {
        return err('device_limit_reached', `Your license allows ${ents.max_devices} desktop terminal(s)`, 409)
      }

      const fp = (await sha256hex(device_public_key)).slice(0, 16)
      const { data: device, error: devErr } = await admin
        .from('desktop_devices')
        .insert({
          tenant_id: tenant.id,
          name: device_name || 'Desktop Terminal',
          public_key: device_public_key,
          public_key_fingerprint: fp,
          device_fingerprint: device_fingerprint || null,
          app_version: app_version || null,
          os: os || null,
          activation_code_id: codeRow.id,
        })
        .select()
        .single()
      if (devErr) {
        // UNIQUE(public_key) WHERE active — this install was already activated
        const { data: existing } = await admin
          .from('desktop_devices').select('*')
          .eq('public_key', device_public_key).eq('status', 'active').maybeSingle()
        if (existing) {
          const lease = await issueLease(admin, existing, tenant, 'reissue')
          return json({ device_id: existing.id, tenant_id: tenant.id, server_time: now, lease, entitlements: ents, reactivated: true })
        }
        return err('device_registration_failed', devErr.message, 500)
      }

      const consumed = await admin.rpc('consume_activation_code', {
        p_code_hash: codeHash, p_device_id: device.id,
      })
      if (!consumed.data) {
        // Lost a race — another activation consumed it first
        await admin.from('desktop_devices').delete().eq('id', device.id)
        return err('code_consumed', 'This activation code has already been used', 410)
      }

      const lease = await issueLease(admin, device, tenant, 'activation')
      const { data: branch } = await admin
        .from('branches').select('id, name').eq('tenant_id', tenant.id).eq('is_main', true).maybeSingle()
      return json({
        device_id: device.id,
        tenant_id: tenant.id,
        server_time: now,
        lease,
        entitlements: ents,
        shop_bootstrap: {
          tenant_name: tenant.name,
          slug: tenant.slug,
          pos_mode: tenant.pos_mode,
          branch: branch || null,
          currency: tenant.currency || 'USD',
          tax_rate: tenant.tax_rate ?? null,
          receipt_settings: tenant.receipt_settings || null,
        },
      })
    }

    if (path === '/v1/download' || path === '/v1/download/info') {
      const os = url.searchParams.get('os') || 'win32-x64'
      const channel = url.searchParams.get('channel') || 'stable'
      const { data: rel } = await admin
        .from('desktop_releases')
        .select('id, version, desktop_release_artifacts(os, storage_path, sha256, size_bytes)')
        .eq('channel', channel)
        .is('withdrawn_at', null)
        .order('published_at', { ascending: false })
        .limit(20)
      const latest = (rel || []).find((r) =>
        (r.desktop_release_artifacts || []).some((a: { os: string }) => a.os === os))
      if (!latest) return err('no_release', `No ${channel} release for ${os}`, 404)
      const art = latest.desktop_release_artifacts.find((a: { os: string }) => a.os === os)
      const { data: signed } = await admin.storage
        .from(BUCKET).createSignedUrl(art.storage_path, SIGNED_URL_TTL)
      if (!signed?.signedUrl) return err('artifact_unavailable', 'Installer unavailable', 404)
      try {
        await admin.from('desktop_downloads').insert({
          release_id: latest.id, version: latest.version, os, channel,
          ip: clientIp(req), ua: req.headers.get('user-agent') || null,
        })
      } catch { /* download logging must never break the redirect */ }
      if (path.endsWith('/info')) {
        return json({ version: latest.version, os, sha256: art.sha256, size_bytes: art.size_bytes, url: signed.signedUrl, expires_in: SIGNED_URL_TTL })
      }
      return new Response(null, { status: 302, headers: { Location: signed.signedUrl, ...CORS } })
    }

    // ══════════ DEVICE-AUTHENTICATED ══════════

    if (path === '/v1/checkin' && req.method === 'POST') {
      const device = await deviceFromSignature(req, path, bodyText, admin)
      if (!device) return err('device_unauthorized', 'Invalid device identity', 401)
      if (device.status === 'deleted') {
        return json({ server_time: now, device_status: 'revoked', flags: { revoked: true, deleted: true } })
      }
      if (device.status === 'revoked') {
        return json({ server_time: now, device_status: 'revoked', flags: { revoked: true } })
      }
      // Suspended devices verify fine but get no renewal and a suspended flag
      const isSuspended = device.status === 'suspended'

      // Idempotent retry — same checkin_id returns the recorded state
      if (body.checkin_id) {
        const { data: dup } = await admin
          .from('desktop_checkins').select('checkin_id').eq('checkin_id', body.checkin_id).maybeSingle()
        if (dup) {
          return json({ server_time: now, device_status: 'active', duplicate: true })
        }
        await admin.from('desktop_checkins').insert({
          checkin_id: body.checkin_id, device_id: device.id,
          app_version: body.app_version || null, os: body.os || null,
          offline_since: body.offline_since || null,
          ip: clientIp(req),
        })
      }

      // ── crack-detection signals (contract §2.9) ──
      // Cloned install: fingerprint changed since activation → license
      // files were copied onto another machine.
      if (body.device_fingerprint && device.device_fingerprint
          && body.device_fingerprint !== device.device_fingerprint
          && !device.flags?.cloned) {
        await admin.rpc('flag_device', { p_device_id: device.id, p_flag: 'cloned' })
        await logEvent(admin, {
          type: 'device_cloned', device_id: device.id, tenant_id: device.tenant_id,
          detail: { expected: device.device_fingerprint, reported: body.device_fingerprint },
          ip: clientIp(req),
        })
      }
      // Unauthorized build: app_version that no published release ships —
      // a patched/self-built binary phoning home.
      if (body.app_version && !device.flags?.unauthorized_build) {
        const { count: relCount } = await admin.from('desktop_releases')
          .select('id', { count: 'exact', head: true })
          .eq('version', body.app_version)
        if ((relCount || 0) === 0) {
          await admin.rpc('flag_device', { p_device_id: device.id, p_flag: 'unauthorized_build' })
          await logEvent(admin, {
            type: 'unauthorized_build', device_id: device.id, tenant_id: device.tenant_id,
            detail: { app_version: body.app_version }, ip: clientIp(req),
          })
        }
      }

      // Rolling session-token chain (contract §2.3) — catches cloned
      // license files even when the clone has valid signatures: only one
      // physical copy can ever hold the latest token, the other diverges.
      if (device.session_token) {
        const tokOk = body.session_token === device.session_token
                   || body.session_token === device.prev_session_token
        if (!tokOk && !device.flags?.cloned) {
          await admin.rpc('flag_device', { p_device_id: device.id, p_flag: 'cloned' })
          await logEvent(admin, {
            type: 'device_cloned', device_id: device.id, tenant_id: device.tenant_id,
            detail: { via: 'session_token_divergence' }, ip: clientIp(req),
          })
        }
      }
      const newSessionToken = crypto.randomUUID()

      await admin.from('desktop_devices').update({
        last_checkin_at: now,
        last_ip: clientIp(req),
        last_ua: req.headers.get('user-agent') || null,
        app_version: body.app_version || device.app_version,
        os: body.os || device.os,
        prev_session_token: device.session_token || null,
        session_token: newSessionToken,
        updated_at: now,
      }).eq('id', device.id)
      const { data: tenant } = await admin.from('tenants').select('*').eq('id', device.tenant_id).single()
      // D1: plan lapsed (or never started) → no more renewals; the device
      // flags it and dies naturally at grace_until — remote revocation
      // can't reach a machine that stays offline anyway.
      const licensed = await hasDesktopLicense(admin, tenant)
      const resp: Record<string, unknown> = {
        server_time: now,
        device_status: isSuspended ? 'suspended' : 'active',
        session_token: newSessionToken,
        flags: { revoked: false, suspended: isSuspended, plan_inactive: !licensed, messages: [] },
      }
      // Renew when ≥50% of the lease has elapsed — but never for a
      // suspended device or a lapsed plan
      const leaseEnd = device.lease_expires_at ? Date.parse(device.lease_expires_at) : 0
      const leaseStart = leaseEnd - LEASE_DAYS * 86400e3
      const elapsed = Date.now() - leaseStart
      if (licensed && !isSuspended
          && (!device.lease_expires_at || elapsed >= (LEASE_DAYS * 86400e3) / 2)) {
        resp.lease = await issueLease(admin, device, tenant, 'renewal')
      }
      resp.entitlements = await entitlementsFor(admin, tenant)
      return json(resp)
    }

    // License Manager queue flush (contract §2.3b/§5b) — dedupe by report_id,
    // accept from ANY authenticated device incl. revoked: a cracked install
    // reporting in is evidence, not an error.
    if (path === '/v1/report' && req.method === 'POST') {
      const device = await deviceFromSignature(req, path, bodyText, admin)
      if (!device) return err('device_unauthorized', 'Invalid device identity', 401)
      const reports = Array.isArray(body.reports) ? body.reports.slice(0, 500) : []
      if (reports.length === 0) return err('bad_request', 'reports[] required', 400)
      const VALID_KINDS = new Set(['sale', 'inventory', 'session', 'error', 'lease_check'])
      const ip = clientIp(req)
      let accepted = 0, duplicates = 0
      for (const r of reports) {
        if (!r?.report_id || !VALID_KINDS.has(r.kind)) { continue }
        const { error: insErr } = await admin.from('desktop_usage_reports').insert({
          report_id: r.report_id,
          device_id: device.id,
          tenant_id: device.tenant_id,
          kind: r.kind,
          occurred_at: r.occurred_at || now,
          data: r.data || {},
          ip,
        })
        if (!insErr) accepted++
        else if (insErr.code === '23505') duplicates++ // PK conflict = already received
      }
      return json({ accepted, duplicates, server_time: now })
    }

    if (path === '/v1/deactivate' && req.method === 'POST') {
      const device = await deviceFromSignature(req, path, bodyText, admin)
      if (!device) return err('device_unauthorized', 'Invalid device identity', 401)
      await admin.from('desktop_devices').update({
        deactivated_at: now, status: 'revoked', revoke_reason: 'self_deactivated', updated_at: now,
      }).eq('id', device.id)
      return json({ ok: true, server_time: now })
    }

    if (path === '/v1/releases/latest' && req.method === 'GET') {
      const device = await deviceFromSignature(req, path, '', admin)
      if (!device) {
        await logEvent(admin, {
          type: 'update_probe_denied',
          detail: { claimed_device_id: req.headers.get('x-device-id') },
          ip: clientIp(req),
        })
        return err('device_unauthorized', 'Invalid device identity', 401)
      }
      const channel = url.searchParams.get('channel') || 'stable'
      const current = url.searchParams.get('version') || '0.0.0'
      const os = url.searchParams.get('os') || 'win32-x64'

      const { data: rels } = await admin
        .from('desktop_releases')
        .select('*, desktop_release_artifacts(*)')
        .eq('channel', channel)
        .is('withdrawn_at', null)
        .order('published_at', { ascending: false })
      const candidates = (rels || []).filter((r) =>
        semverCmp(r.version, current) > 0 &&
        (r.desktop_release_artifacts || []).some((a: { os: string }) => a.os === os))

      for (const r of candidates) {
        if (await rolloutBucket(device.id, r.version) < r.rollout_pct) {
          const manifest = {
            version: r.version,
            channel: r.channel,
            min_supported_version: r.min_supported_version,
            rollout_pct: r.rollout_pct,
            release_notes_url: r.release_notes_url,
            published_at: r.published_at,
            artifacts: (r.desktop_release_artifacts || [])
              .filter((a: { os: string }) => a.os === os)
              .map((a: { os: string; storage_path: string; sha256: string; size_bytes: number; signature: string }) => ({
                os: a.os,
                url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/desktop-license/v1/download?os=${a.os}&channel=${r.channel}`,
                sha256: a.sha256,
                size_bytes: a.size_bytes,
                signature: a.signature,
              })),
          }
          const resp: Record<string, unknown> = {
            manifest,
            manifest_signature: await sign(manifest),
            server_time: now,
          }
          if (semverCmp(current, r.min_supported_version) < 0) resp.mandatory = true
          return json(resp)
        }
      }
      return json({ update_available: false, server_time: now })
    }

    // ══════════ TENANT-ADMIN ══════════

    if (path === '/v1/activation-codes' && req.method === 'POST') {
      const caller = await callerTenant(req, admin)
      if (!caller?.tenant_id && caller?.role !== 'staff') return err('unauthorized', 'Tenant account required', 401)
      const tenantId = caller.tenant_id || body.tenant_id
      if (!tenantId) return err('bad_request', 'tenant_id required', 400)
      const code = generateCode()
      const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60e3)
      const { data: row, error: insErr } = await admin
        .from('desktop_activation_codes')
        .insert({
          tenant_id: tenantId,
          code_hash: await sha256hex(code),
          code_hint: code.slice(-4),
          label: body.device_label || '',
          expires_at: expires.toISOString(),
          created_by: caller.id,
        })
        .select('id, label, status, expires_at, created_at')
        .single()
      if (insErr) return err('create_failed', insErr.message, 500)
      await logEvent(admin, { type: 'license_issued', tenant_id: tenantId, detail: { code_id: row.id, label: row.label, by: 'tenant' }, ip: clientIp(req) })
      return json({ code, code_id: row.id, label: row.label, expires_at: row.expires_at }, 201)
    }

    if (path === '/v1/activation-codes' && req.method === 'GET') {
      const caller = await callerTenant(req, admin)
      if (!caller) return err('unauthorized', 'Sign-in required', 401)
      let q = admin.from('desktop_activation_codes')
        .select('id, tenant_id, code_hint, label, status, expires_at, created_at, consumed_at, consumed_by_device_id')
        .order('created_at', { ascending: false })
      if (caller.tenant_id) q = q.eq('tenant_id', caller.tenant_id)
      const { data, error: qErr } = await q.limit(200)
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ codes: data || [] })
    }

    const codeMatch = path.match(/^\/v1\/activation-codes\/([\w-]+)$/)
    if (codeMatch && req.method === 'DELETE') {
      const caller = await callerTenant(req, admin)
      if (!caller) return err('unauthorized', 'Sign-in required', 401)
      const { data: codeRow } = await admin
        .from('desktop_activation_codes').select('*').eq('id', codeMatch[1]).maybeSingle()
      if (!codeRow || (caller.tenant_id && codeRow.tenant_id !== caller.tenant_id && caller.role !== 'staff')) {
        return err('not_found', 'Code not found', 404)
      }
      if (codeRow.status !== 'pending') return err('not_revocable', `Code is already ${codeRow.status}`, 409)
      await admin.from('desktop_activation_codes')
        .update({ status: 'revoked', revoked_at: now, revoked_by: caller.id })
        .eq('id', codeRow.id)
      return new Response(null, { status: 204, headers: CORS })
    }

    // Once-off $150 license purchase (contract §2.2b) — code + pending
    // purchase; activates only after staff/webhook marks it paid.
    if (path === '/v1/licenses/purchase' && req.method === 'POST') {
      const caller = await callerTenant(req, admin)
      if (!caller?.tenant_id) return err('unauthorized', 'Tenant account required', 401)
      const code = generateCode()
      const expires = new Date(Date.now() + 7 * 86400e3) // 7-day TTL — covers payment settlement
      const { data: codeRow, error: cErr } = await admin
        .from('desktop_activation_codes')
        .insert({
          tenant_id: caller.tenant_id,
          code_hash: await sha256hex(code),
          code_hint: code.slice(-4),
          label: body.device_label || 'Purchased license',
          expires_at: expires.toISOString(),
          created_by: caller.id,
        })
        .select('id').single()
      if (cErr) return err('create_failed', cErr.message, 500)
      const { data: purchase, error: pErr } = await admin
        .from('desktop_license_purchases')
        .insert({
          tenant_id: caller.tenant_id,
          code_id: codeRow.id,
          amount: DESKTOP_LICENSE_PRICE_USD,
          source: 'self',
          status: 'pending',
          payment_ref: body.payment_ref || null,
          created_by: caller.id,
        })
        .select('id, amount, currency, status, created_at').single()
      if (pErr) return err('create_failed', pErr.message, 500)
      await logEvent(admin, { type: 'license_issued', tenant_id: caller.tenant_id, detail: { code_id: codeRow.id, purchase_id: purchase.id, source: 'self', amount: purchase.amount }, ip: clientIp(req) })
      return json({ purchase, code, code_id: codeRow.id, expires_at: expires.toISOString() }, 201)
    }

    if (path === '/v1/licenses' && req.method === 'GET') {
      const caller = await callerTenant(req, admin)
      if (!caller?.tenant_id) return err('unauthorized', 'Tenant account required', 401)
      const { data: purchases } = await admin.from('desktop_license_purchases')
        .select('id, amount, currency, status, source, payment_ref, paid_at, created_at, code_id')
        .eq('tenant_id', caller.tenant_id).order('created_at', { ascending: false }).limit(200)
      const { data: codes } = await admin.from('desktop_activation_codes')
        .select('id, code_hint, label, status, expires_at, consumed_at')
        .eq('tenant_id', caller.tenant_id).order('created_at', { ascending: false }).limit(200)
      return json({ purchases: purchases || [], codes: codes || [] })
    }

    // Tenant links their Paynow reference to their pending purchase — the
    // payment_sessions settle trigger then flips it to paid automatically.
    const myPurchMatch = path.match(/^\/v1\/licenses\/purchases\/([\w-]+)$/)
    if (myPurchMatch && req.method === 'PATCH') {
      const caller = await callerTenant(req, admin)
      if (!caller?.tenant_id) return err('unauthorized', 'Tenant account required', 401)
      const { data: row, error: uErr } = await admin.from('desktop_license_purchases')
        .update({ payment_ref: String(body.payment_ref || '').slice(0, 120) })
        .eq('id', myPurchMatch[1])
        .eq('tenant_id', caller.tenant_id)
        .eq('status', 'pending')
        .select('id, status, payment_ref')
        .maybeSingle()
      if (uErr) return err('update_failed', uErr.message, 500)
      if (!row) return err('not_found', 'Pending purchase not found', 404)
      return json({ purchase: row })
    }

    // Stripe hosted checkout for a pending purchase — webhook marks it paid
    // via metadata.kind='desktop_license' + purchase_id.
    const stripeMatch = path.match(/^\/v1\/licenses\/purchases\/([\w-]+)\/stripe-checkout$/)
    if (stripeMatch && req.method === 'POST') {
      const caller = await callerTenant(req, admin)
      if (!caller?.tenant_id) return err('unauthorized', 'Tenant account required', 401)
      const { data: purchase } = await admin.from('desktop_license_purchases')
        .select('id, status, amount, currency')
        .eq('id', stripeMatch[1]).eq('tenant_id', caller.tenant_id).maybeSingle()
      if (!purchase) return err('not_found', 'Purchase not found', 404)
      if (purchase.status !== 'pending') return err('conflict', `Purchase already ${purchase.status}`, 409)
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeKey) return err('not_configured', 'Stripe is not configured — pay with Paynow or contact support', 503)
      const reference = `TDL-${purchase.id}`
      const returnUrl = body.return_url || ''
      const form = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': (purchase.currency || 'usd').toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(Math.round(Number(purchase.amount) * 100)),
        'line_items[0][price_data][product_data][name]': 'TengaPOS Desktop License (once-off)',
        success_url: `${returnUrl}?provider=stripe&status=success&ref=${reference}`,
        cancel_url: `${returnUrl}?provider=stripe&status=cancelled&ref=${reference}`,
        client_reference_id: caller.tenant_id,
        'metadata[kind]': 'desktop_license',
        'metadata[tenant_id]': caller.tenant_id,
        'metadata[plan_type]': 'desktop_license',
        'metadata[purchase_id]': purchase.id,
        'metadata[reference]': reference,
      })
      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      const session = await stripeRes.json()
      if (!stripeRes.ok) return err('stripe_failed', session?.error?.message || 'Stripe checkout failed', 400)
      await admin.from('desktop_license_purchases')
        .update({ payment_ref: reference }).eq('id', purchase.id)
      return json({ url: session.url, reference })
    }

    if (path === '/v1/devices' && req.method === 'GET') {
      const caller = await callerTenant(req, admin)
      if (!caller) return err('unauthorized', 'Sign-in required', 401)
      let q = admin.from('desktop_devices')
        .select('id, tenant_id, name, public_key_fingerprint, status, app_version, os, activated_at, last_checkin_at, lease_expires_at, grace_until, revoked_at, deactivate_reason:revoke_reason')
        .order('activated_at', { ascending: false })
      if (caller.tenant_id) q = q.eq('tenant_id', caller.tenant_id)
      const { data, error: qErr } = await q.limit(200)
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ devices: data || [] })
    }

    const devMatch = path.match(/^\/v1\/devices\/([\w-]+)\/(revoke|unrevoke)$/)
    if (devMatch && req.method === 'POST') {
      const caller = await callerTenant(req, admin)
      if (!caller) return err('unauthorized', 'Sign-in required', 401)
      const { data: device } = await admin
        .from('desktop_devices').select('*').eq('id', devMatch[1]).maybeSingle()
      if (!device || (caller.tenant_id && device.tenant_id !== caller.tenant_id && caller.role !== 'staff')) {
        return err('not_found', 'Device not found', 404)
      }
      if (devMatch[2] === 'revoke') {
        await admin.from('desktop_devices').update({
          status: 'revoked', revoked_at: now, revoked_by: caller.id,
          revoke_reason: body.reason || 'revoked_by_admin', updated_at: now,
        }).eq('id', device.id)
        await logEvent(admin, { type: 'device_revoked', device_id: device.id, tenant_id: device.tenant_id, detail: { by: 'tenant', reason: body.reason || 'revoked_by_admin' }, ip: clientIp(req) })
      } else {
        await admin.from('desktop_devices').update({
          status: 'active', revoked_at: null, revoked_by: null, revoke_reason: null, suspended_at: null, updated_at: now,
        }).eq('id', device.id)
        await logEvent(admin, { type: 'device_reinstated', device_id: device.id, tenant_id: device.tenant_id, detail: { by: 'tenant' }, ip: clientIp(req) })
      }
      return json({ ok: true, device_id: device.id, status: devMatch[2] === 'revoke' ? 'revoked' : 'active' })
    }

    // ══════════ SUPER ADMIN — releases ══════════

    if (path === '/v1/releases' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { data, error: qErr } = await admin
        .from('desktop_releases')
        .select('*, desktop_release_artifacts(*)')
        .order('published_at', { ascending: false })
        .limit(100)
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ releases: data || [] })
    }

    if (path === '/v1/releases' && req.method === 'POST') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { version, channel, min_supported_version, rollout_pct, release_notes_url, artifacts } = body
      if (!version || !Array.isArray(artifacts) || artifacts.length === 0) {
        return err('bad_request', 'version and artifacts[] are required', 400)
      }
      for (const a of artifacts) {
        if (!a.os || !a.storage_path || !a.sha256) {
          return err('bad_request', 'each artifact needs os, storage_path, sha256', 400)
        }
        // Sign the sha256 digest bytes with the license key — the desktop
        // verifies artifact integrity + authenticity before installing.
        a.signature = b64encode(await ed.signAsync(b64decode(hexToB64(a.sha256)), await privateKey()))
      }
      const manifest = {
        version, channel: channel || 'stable',
        min_supported_version: min_supported_version || '0.0.0',
        rollout_pct: rollout_pct ?? 100,
        release_notes_url: release_notes_url || null,
        published_at: now,
        artifacts: artifacts.map((a: Record<string, unknown>) => ({
          os: a.os, sha256: a.sha256, size_bytes: a.size_bytes, signature: a.signature,
        })),
      }
      const manifestSignature = await sign(manifest)
      const { data: rel, error: relErr } = await admin
        .from('desktop_releases')
        .insert({
          version, channel: channel || 'stable',
          min_supported_version: manifest.min_supported_version,
          rollout_pct: manifest.rollout_pct,
          release_notes_url: manifest.release_notes_url,
          manifest_signature: manifestSignature,
          published_at: now,
          created_by: null,
        })
        .select()
        .single()
      if (relErr) return err('create_failed', relErr.message, 500)
      const { error: artErr } = await admin.from('desktop_release_artifacts').insert(
        artifacts.map((a: Record<string, unknown>) => ({
          release_id: rel.id, os: a.os, storage_path: a.storage_path,
          sha256: a.sha256, size_bytes: a.size_bytes || 0, signature: a.signature,
        })),
      )
      if (artErr) {
        await admin.from('desktop_releases').delete().eq('id', rel.id)
        return err('create_failed', artErr.message, 500)
      }
      return json({ release: rel, manifest_signature: manifestSignature }, 201)
    }

    const relMatch = path.match(/^\/v1\/releases\/([\w-]+)$/)
    if (relMatch && req.method === 'PATCH') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const patch: Record<string, unknown> = {}
      if (body.rollout_pct !== undefined) patch.rollout_pct = body.rollout_pct
      if (body.min_supported_version !== undefined) patch.min_supported_version = body.min_supported_version
      if (body.channel !== undefined) patch.channel = body.channel
      if (body.withdraw === true) patch.withdrawn_at = now
      if (body.withdraw === false) patch.withdrawn_at = null
      if (body.release_notes_url !== undefined) patch.release_notes_url = body.release_notes_url
      if (Object.keys(patch).length === 0) return err('bad_request', 'nothing to patch', 400)
      const { error: uErr } = await admin.from('desktop_releases').update(patch).eq('id', relMatch[1])
      if (uErr) return err('update_failed', uErr.message, 500)
      return json({ ok: true })
    }

    // ══════════ SUPER ADMIN — fleet + security (§2.9) ══════════

    if (path === '/v1/admin/licenses' && req.method === 'POST') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      if (!body.tenant_id) return err('bad_request', 'tenant_id required', 400)
      const ttl = Math.min(Number(body.ttl_minutes) || CODE_TTL_MINUTES, 10080) // max 7 days
      const code = generateCode()
      const { data: row, error: insErr } = await admin
        .from('desktop_activation_codes')
        .insert({
          tenant_id: body.tenant_id,
          code_hash: await sha256hex(code),
          code_hint: code.slice(-4),
          label: body.device_label || 'Staff-issued',
          expires_at: new Date(Date.now() + ttl * 60e3).toISOString(),
        })
        .select('id, label, expires_at')
        .single()
      if (insErr) return err('create_failed', insErr.message, 500)
      await logEvent(admin, { type: 'license_issued', tenant_id: body.tenant_id, detail: { code_id: row.id, label: row.label, by: 'staff', ttl_minutes: ttl }, ip: clientIp(req) })
      // Staff-issued = already paid, $0 — shows in the unified admin feed.
      await admin.from('desktop_license_purchases').insert({
        tenant_id: body.tenant_id, code_id: row.id, amount: 0,
        status: 'paid', source: 'staff', paid_at: now,
      })
      return json({ code, code_id: row.id, label: row.label, expires_at: row.expires_at }, 201)
    }

    if (path === '/v1/admin/licenses' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { data: purchases } = await admin.from('desktop_license_purchases')
        .select('*, tenants(name), desktop_activation_codes(code_hint, label, status, consumed_at)')
        .order('created_at', { ascending: false }).limit(500)
      const { data: codes } = await admin.from('desktop_activation_codes')
        .select('id, tenant_id, code_hint, label, status, expires_at, consumed_at, created_at, tenants(name)')
        .order('created_at', { ascending: false }).limit(500)
      return json({ purchases: purchases || [], codes: codes || [] })
    }

    const purchMatch = path.match(/^\/v1\/admin\/licenses\/purchases\/([\w-]+)$/)
    if (purchMatch && req.method === 'PATCH') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      if (!['paid', 'refunded', 'pending'].includes(body.status)) {
        return err('bad_request', 'status must be paid|refunded|pending', 400)
      }
      const { data: row, error: uErr } = await admin.from('desktop_license_purchases')
        .update({ status: body.status, paid_at: body.status === 'paid' ? now : null })
        .eq('id', purchMatch[1]).select().single()
      if (uErr) return err('update_failed', uErr.message, 500)
      await logEvent(admin, { type: 'license_payment_marked', tenant_id: row.tenant_id, detail: { purchase_id: row.id, status: body.status }, ip: clientIp(req) })
      return json({ purchase: row })
    }

    if (path === '/v1/admin/devices' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      let q = admin.from('desktop_devices')
        .select('id, tenant_id, name, public_key_fingerprint, status, flags, app_version, os, last_ip, activated_at, last_checkin_at, lease_expires_at, grace_until, revoked_at, tenants(name)')
        .order('last_checkin_at', { ascending: false, nullsFirst: false })
        .limit(500)
      const status = url.searchParams.get('status')
      if (status) q = q.eq('status', status)
      const flag = url.searchParams.get('flag')
      if (flag) q = q.contains('flags', { [flag]: true })
      const { data, error: qErr } = await q
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ devices: data || [] })
    }

    const admDevMatch = path.match(/^\/v1\/admin\/devices\/([\w-]+)(\/(suspend|revoke|delete))?$/)
    if (admDevMatch) {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const deviceId = admDevMatch[1]
      const action = admDevMatch[3]
      const { data: device } = await admin
        .from('desktop_devices').select('*, tenants(name)').eq('id', deviceId).maybeSingle()
      if (!device) return err('not_found', 'Device not found', 404)

      if (req.method === 'GET' && !action) {
        const { data: checkins } = await admin.from('desktop_checkins')
          .select('*').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(50)
        const { data: events } = await admin.from('desktop_license_events')
          .select('*').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(100)
        const { data: reports } = await admin.from('desktop_usage_reports')
          .select('*').eq('device_id', deviceId).order('occurred_at', { ascending: false }).limit(100)
        return json({ device, checkins: checkins || [], events: events || [], reports: reports || [] })
      }

      if (req.method === 'POST' && action === 'suspend') {
        await admin.from('desktop_devices').update({
          status: 'suspended', suspended_at: now, updated_at: now,
        }).eq('id', deviceId)
        await logEvent(admin, { type: 'device_suspended', device_id: deviceId, tenant_id: device.tenant_id, detail: { reason: body.reason || null }, ip: clientIp(req) })
        return json({ ok: true, device_id: deviceId, status: 'suspended' })
      }
      if (req.method === 'POST' && action === 'revoke') {
        await admin.from('desktop_devices').update({
          status: 'revoked', revoked_at: now, revoke_reason: body.reason || 'revoked_by_staff', updated_at: now,
        }).eq('id', deviceId)
        await logEvent(admin, { type: 'device_revoked', device_id: deviceId, tenant_id: device.tenant_id, detail: { by: 'staff', reason: body.reason || null }, ip: clientIp(req) })
        return json({ ok: true, device_id: deviceId, status: 'revoked' })
      }
      if (req.method === 'POST' && action === 'delete') {
        await admin.from('desktop_devices').update({
          status: 'deleted', deleted_at: now, updated_at: now,
        }).eq('id', deviceId)
        await logEvent(admin, { type: 'device_deleted', device_id: deviceId, tenant_id: device.tenant_id, detail: { by: 'staff' }, ip: clientIp(req) })
        return json({ ok: true, device_id: deviceId, status: 'deleted' })
      }
      return err('bad_request', 'Unsupported device action', 400)
    }

    if (path === '/v1/admin/events' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      let q = admin.from('desktop_license_events')
        .select('*, desktop_devices(name), tenants(name)')
        .order('created_at', { ascending: false }).limit(500)
      const type = url.searchParams.get('type')
      if (type) q = q.eq('type', type)
      const devId = url.searchParams.get('device_id')
      if (devId) q = q.eq('device_id', devId)
      const { data, error: qErr } = await q
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ events: data || [] })
    }

    if (path === '/v1/admin/reports' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      let q = admin.from('desktop_usage_reports')
        .select('*, desktop_devices(name), tenants(name)')
        .order('occurred_at', { ascending: false }).limit(500)
      const devId = url.searchParams.get('device_id')
      if (devId) q = q.eq('device_id', devId)
      const kind = url.searchParams.get('kind')
      if (kind) q = q.eq('kind', kind)
      const { data, error: qErr } = await q
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ reports: data || [] })
    }

    if (path === '/v1/admin/stats' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { data: devices } = await admin.from('desktop_devices')
        .select('id, name, status, app_version, flags, activated_at, last_checkin_at')
      const { data: downloads } = await admin.from('desktop_downloads').select('version, channel')
      const { count: openCases } = await admin.from('desktop_infringement_cases')
        .select('id', { count: 'exact', head: true }).in('status', ['detected', 'notice_sent', 'escalated'])
      const byStatus: Record<string, number> = {}
      const byVersion: Record<string, number> = {}
      const darkThreshold = Date.now() - 7 * 86400e3 // §5b: silent >7d = dark
      const darkDevices: { id: string; name: string; last_seen: string }[] = []
      let flagged = 0
      for (const d of devices || []) {
        byStatus[d.status] = (byStatus[d.status] || 0) + 1
        byVersion[d.app_version || 'unknown'] = (byVersion[d.app_version || 'unknown'] || 0) + 1
        if (d.flags && Object.keys(d.flags).length > 0) flagged++
        const lastSeen = Date.parse(d.last_checkin_at || d.activated_at || '')
        if (d.status === 'active' && lastSeen && lastSeen < darkThreshold) {
          darkDevices.push({ id: d.id, name: d.name, last_seen: d.last_checkin_at || d.activated_at })
        }
      }
      const byRelease: Record<string, number> = {}
      for (const d of downloads || []) {
        byRelease[`${d.version}/${d.channel}`] = (byRelease[`${d.version}/${d.channel}`] || 0) + 1
      }
      return json({
        total_devices: (devices || []).length,
        flagged_devices: flagged,
        dark_devices: darkDevices.length,
        dark_device_ids: darkDevices,
        by_status: byStatus,
        by_version: byVersion,
        downloads_by_release: byRelease,
        total_downloads: (downloads || []).length,
        open_infringement_cases: openCases || 0,
      })
    }

    if (path === '/v1/admin/downloads' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { data, error: qErr } = await admin.from('desktop_downloads')
        .select('*').order('created_at', { ascending: false }).limit(500)
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ downloads: data || [] })
    }

    if (path === '/v1/admin/infringements' && req.method === 'GET') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      let q = admin.from('desktop_infringement_cases')
        .select('*, tenants(name), desktop_devices(name)')
        .order('created_at', { ascending: false }).limit(500)
      const st = url.searchParams.get('status')
      if (st) q = q.eq('status', st)
      const { data, error: qErr } = await q
      if (qErr) return err('query_failed', qErr.message, 500)
      return json({ cases: data || [] })
    }

    if (path === '/v1/admin/infringements' && req.method === 'POST') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const { data: row, error: insErr } = await admin
        .from('desktop_infringement_cases')
        .insert({
          source: body.source || 'manual',
          device_id: body.device_id || null,
          tenant_id: body.tenant_id || null,
          ip: body.ip || null,
          fingerprint: body.fingerprint || null,
          description: body.description || '',
          evidence: body.evidence || {},
          plan_rate: body.plan_rate ?? null,
          months_observed: body.months_observed ?? null,
          seats: body.seats || 1,
          notes: body.notes || null,
        })
        .select()
        .single()
      if (insErr) return err('create_failed', insErr.message, 500)
      return json({ case: row }, 201)
    }

    const infMatch = path.match(/^\/v1\/admin\/infringements\/([\w-]+)$/)
    if (infMatch && req.method === 'PATCH') {
      if (!(await isSuperAdmin(req, admin))) return err('forbidden', 'Super Admin only', 403)
      const patch: Record<string, unknown> = { updated_at: now }
      for (const k of ['status', 'description', 'evidence', 'plan_rate', 'months_observed', 'seats', 'notes', 'notice_recipient', 'notice_channel', 'source', 'tenant_id', 'device_id', 'ip', 'fingerprint']) {
        if (body[k] !== undefined) patch[k] = body[k]
      }
      if (body.status === 'notice_sent' && !body.notice_sent_at) patch.notice_sent_at = now
      if (body.notice_sent_at) patch.notice_sent_at = body.notice_sent_at
      const { data: row, error: uErr } = await admin
        .from('desktop_infringement_cases').update(patch).eq('id', infMatch[1]).select().single()
      if (uErr) return err('update_failed', uErr.message, 500)
      return json({ case: row })
    }

    return err('not_found', `Unknown route ${req.method} ${path}`, 404)
  } catch (e) {
    return err('internal', e instanceof Error ? e.message : String(e), 500, true)
  }
})

// (artifact signature is over the sha256 digest BYTES — see hexToB64
// in _shared/license-utils.ts)

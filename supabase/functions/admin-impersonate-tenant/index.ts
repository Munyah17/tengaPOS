// "View as Tenant" -- lets Super Admin/Admin sign in AS a tenant's own
// Vendor account for support/operations purposes, with the exact same
// rights that Vendor has (not a restricted read-only view). Works by
// minting a real Supabase session for the Vendor via a server-side
// magiclink generate+verify round trip (service role only -- the
// client never sees the Vendor's password, because there isn't one
// involved at all).
//
// Every use is logged to audit_logs -- this is a real, consequential
// permission and must be traceable to exactly who did it and when.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    const { data: callerRow } = await admin.from('app_users').select('role').eq('id', caller.id).maybeSingle()
    if (!callerRow || !['super_admin', 'admin'].includes(callerRow.role)) {
      return json({ error: 'Only platform staff can view a business as its owner' }, 403)
    }

    const { tenant_id } = await req.json()
    if (!tenant_id) return json({ error: 'tenant_id is required' }, 400)

    const { data: tenant } = await admin.from('tenants').select('id, name, status').eq('id', tenant_id).maybeSingle()
    if (!tenant) return json({ error: 'Business not found' }, 404)

    const { data: vendor } = await admin
      .from('users')
      .select('id, email, name, is_locked, locked_reason')
      .eq('tenant_id', tenant_id)
      .eq('role', 'vendor')
      .eq('is_active', true)
      .maybeSingle()
    if (!vendor?.email) return json({ error: 'No active owner account found for this business' }, 404)
    if (vendor.is_locked) return json({ error: `Cannot view as this business — the owner account is locked: ${vendor.locked_reason || 'Security measure. Unlock to continue.'}` }, 403)

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: vendor.email,
    })
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: linkErr?.message || 'Could not create a session' }, 500)
    }

    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: linkData.properties.hashed_token }),
    })
    const session = await verifyRes.json()
    if (!session?.access_token) {
      return json({ error: session?.msg || 'Could not start the session' }, 500)
    }

    await admin.from('audit_logs').insert({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'tenant_impersonated',
      target_type: 'tenant',
      target_id: tenant_id,
      details: { tenant_name: tenant.name, vendor_user_id: vendor.id, vendor_email: vendor.email },
    })

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      tenant_name: tenant.name,
      vendor_name: vendor.name,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

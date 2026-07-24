// Tenant (vendor) staff creation — a Vendor/Shop Manager adds staff directly,
// with a password, no invitation link. Mirrors create-staff for the platform
// side, but scoped to the caller's own tenant and tenant-level roles only.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TENANT_ROLES = ['shop_manager', 'supervisor', 'cashier', 'shop_assistant']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    const { data: callerRow } = await admin
      .from('users')
      .select('tenant_id, role, is_active')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerRow?.is_active || !['vendor', 'shop_manager'].includes(callerRow.role)) {
      return json({ error: 'Only the business owner or a shop manager can add staff' }, 403)
    }

    const { data: tenantRow } = await admin
      .from('tenants')
      .select('features')
      .eq('id', callerRow.tenant_id)
      .maybeSingle()
    const features = tenantRow?.features || {}

    const { name, email, password, role, branch_id, username } = await req.json()
    if (!name || !email || !password || !role) {
      return json({ error: 'Missing required fields: name, email, password, role' }, 400)
    }
    const cleanUsername = username ? String(username).trim().toLowerCase() : null
    if (cleanUsername && !/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) {
      return json({ error: 'Username must be 3-30 characters: letters, numbers, dots, underscores, or hyphens only' }, 400)
    }
    // Every tenant has exactly one Vendor (the business owner) — that
    // account is created once, at signup. Staff can only ever be added as
    // one of the roles below.
    if (!TENANT_ROLES.includes(role)) {
      return json({ error: `Role must be one of ${TENANT_ROLES.join(', ')}` }, 400)
    }
    if (String(password).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    if (features.max_users_per_branch != null) {
      if (!branch_id) return json({ error: 'Select a branch for this staff member' }, 400)
      const { data: branchRow } = await admin
        .from('branches')
        .select('id')
        .eq('id', branch_id)
        .eq('tenant_id', callerRow.tenant_id)
        .maybeSingle()
      if (!branchRow) return json({ error: 'Branch not found' }, 400)
      const { count } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', callerRow.tenant_id)
        .eq('branch_id', branch_id)
      if ((count || 0) >= features.max_users_per_branch) {
        return json({ error: `Your plan allows up to ${features.max_users_per_branch} staff per branch` }, 400)
      }
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, skip_tenant_setup: 'true' },
    })
    if (createErr) return json({ error: createErr.message }, 400)

    const { error: insertErr } = await admin.from('users').insert({
      id: created.user.id,
      tenant_id: callerRow.tenant_id,
      name,
      email,
      role,
      branch_id: role === 'vendor' ? null : (branch_id || null),
      username: cleanUsername,
      is_active: true,
    })
    if (insertErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      const msg = insertErr.message?.includes('users_tenant_username_key') || insertErr.code === '23505'
        ? 'That username is already taken in your business — try another'
        : insertErr.message
      return json({ error: msg }, 400)
    }

    return json({ ok: true, id: created.user.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

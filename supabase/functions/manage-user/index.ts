// Platform staff manage tenant (client/vendor) user accounts.
// Actions: create, delete, reset_password.
//  - create / reset_password: active Admin or Super Admin
//  - delete: Super Admin only
// Suspend/edit go straight through RLS-guarded table updates.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TENANT_ROLES = ['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']

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
      .from('app_users')
      .select('role, is_active')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerRow?.is_active || !['super_admin', 'admin'].includes(callerRow.role)) {
      return json({ error: 'Platform staff access required' }, 403)
    }

    const body = await req.json()
    const action = body.action

    if (action === 'create') {
      const { tenant_id, name, email, password, role } = body
      if (!tenant_id || !name || !email || !password || !role) {
        return json({ error: 'Missing fields: tenant_id, name, email, password, role' }, 400)
      }
      if (!TENANT_ROLES.includes(role)) return json({ error: `Role must be one of ${TENANT_ROLES.join(', ')}` }, 400)
      if (String(password).length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

      const { data: tenant } = await admin.from('tenants').select('id, name').eq('id', tenant_id).maybeSingle()
      if (!tenant) return json({ error: 'Tenant not found' }, 404)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, skip_tenant_setup: 'true' },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const { error: insertErr } = await admin.from('users').insert({
        id: created.user.id,
        tenant_id,
        name,
        email,
        role,
        is_active: true,
      })
      if (insertErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: insertErr.message }, 400)
      }

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: 'client_user_created',
        target_type: 'user',
        target_id: created.user.id,
        details: { name, email, role, tenant: tenant.name },
      })
      return json({ ok: true, id: created.user.id })
    }

    if (action === 'reset_password') {
      const { user_id, new_password } = body
      if (!user_id || !new_password) return json({ error: 'Missing fields: user_id, new_password' }, 400)
      if (String(new_password).length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

      const { data: target } = await admin.from('users').select('id, email, name').eq('id', user_id).maybeSingle()
      if (!target) return json({ error: 'User not found (platform staff cannot be managed here)' }, 404)

      const { error: updErr } = await admin.auth.admin.updateUserById(user_id, { password: new_password })
      if (updErr) return json({ error: updErr.message }, 400)

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: 'client_password_reset',
        target_type: 'user',
        target_id: user_id,
        details: { email: target.email },
      })
      return json({ ok: true })
    }

    if (action === 'delete') {
      if (callerRow.role !== 'super_admin') {
        return json({ error: 'Only the Super Admin can delete client accounts' }, 403)
      }
      const { user_id } = body
      if (!user_id) return json({ error: 'Missing field: user_id' }, 400)

      const { data: target } = await admin.from('users').select('id, email, name, role').eq('id', user_id).maybeSingle()
      if (!target) return json({ error: 'User not found (platform staff cannot be deleted here)' }, 404)

      await admin.from('users').delete().eq('id', user_id)
      const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
      if (delErr && !delErr.message?.includes('not found')) {
        return json({ error: delErr.message }, 400)
      }

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: 'client_user_deleted',
        target_type: 'user',
        target_id: user_id,
        details: { email: target.email, role: target.role },
      })
      return json({ ok: true })
    }

    return json({ error: 'Unknown action — use create, delete, or reset_password' }, 400)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

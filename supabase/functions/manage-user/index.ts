// Platform staff manage tenant (client/vendor) user accounts.
// Actions: create, delete, reset_password, update_user, ban, unban,
// force_logout, get_auth_info.
//  - create / reset_password / update_user / get_auth_info: active Admin or Super Admin
//  - delete / ban / unban / force_logout: Super Admin only
//  - update_user email/tenant moves: Super Admin only
// Simple suspend toggles still go through RLS-guarded table updates.
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
      const { tenant_id, name, email, password, role, branch_id } = body
      if (!tenant_id || !name || !email || !password || !role) {
        return json({ error: 'Missing fields: tenant_id, name, email, password, role' }, 400)
      }
      if (!TENANT_ROLES.includes(role)) return json({ error: `Role must be one of ${TENANT_ROLES.join(', ')}` }, 400)
      if (String(password).length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

      const { data: tenant } = await admin.from('tenants').select('id, name').eq('id', tenant_id).maybeSingle()
      if (!tenant) return json({ error: 'Tenant not found' }, 404)

      // A user with no branch fails RLS on every branch-scoped product in
      // any multi-branch (or even single-branch-but-scoped) tenant --
      // confirmed live: a cashier created here saw only ~1/3 of a real
      // tenant's catalog with no error, just fewer products than expected.
      // tenant-add-staff (the vendor's own "Add Staff" flow) already
      // requires this for every non-vendor role; this path never did.
      if (role !== 'vendor') {
        if (!branch_id) return json({ error: 'Select a branch for this user' }, 400)
        const { data: b } = await admin.from('branches').select('id').eq('id', branch_id).eq('tenant_id', tenant_id).maybeSingle()
        if (!b) return json({ error: 'Branch not found in that business' }, 400)
      }

      let { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, skip_tenant_setup: 'true' },
      })
      if (createErr?.message?.includes('already been registered')) {
        // See tenant-add-staff's identical check: a leftover auth.users row
        // with no matching public.users/app_users is an orphan (from an
        // earlier failed attempt), not a genuine duplicate — clean it up
        // and retry once instead of permanently refusing this email.
        const { data: existing } = await admin.auth.admin.listUsers()
        const orphan = existing?.users?.find((u) => u.email === email)
        if (orphan) {
          const [{ data: userRow }, { data: appUserRow }] = await Promise.all([
            admin.from('users').select('id').eq('id', orphan.id).maybeSingle(),
            admin.from('app_users').select('id').eq('id', orphan.id).maybeSingle(),
          ])
          if (!userRow && !appUserRow) {
            await admin.auth.admin.deleteUser(orphan.id)
            const retry = await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { name, skip_tenant_setup: 'true' },
            })
            created = retry.data
            createErr = retry.error
          }
        }
      }
      if (createErr) return json({ error: createErr.message }, 400)

      const { error: insertErr } = await admin.from('users').insert({
        id: created.user.id,
        tenant_id,
        name,
        email,
        role,
        branch_id: role === 'vendor' ? null : branch_id,
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

    if (action === 'update_user') {
      const { user_id, name, email, phone, username, role, tenant_id, branch_id, is_active } = body
      if (!user_id) return json({ error: 'Missing field: user_id' }, 400)

      const { data: target } = await admin.from('users').select('id, email, tenant_id').eq('id', user_id).maybeSingle()
      if (!target) return json({ error: 'User not found (platform staff cannot be managed here)' }, 404)

      const isSuper = callerRow.role === 'super_admin'
      const emailChanging = email !== undefined && email !== target.email
      const tenantChanging = tenant_id !== undefined && tenant_id !== target.tenant_id
      if ((emailChanging || tenantChanging) && !isSuper) {
        return json({ error: 'Only the Super Admin can change a user\'s email or move them between businesses' }, 403)
      }
      if (role !== undefined && !TENANT_ROLES.includes(role)) {
        return json({ error: `Role must be one of ${TENANT_ROLES.join(', ')}` }, 400)
      }
      if (tenantChanging) {
        const { data: t } = await admin.from('tenants').select('id').eq('id', tenant_id).maybeSingle()
        if (!t) return json({ error: 'Target tenant not found' }, 404)
      }
      if (branch_id) {
        const { data: b } = await admin.from('branches').select('id, tenant_id').eq('id', branch_id).maybeSingle()
        const effectiveTenant = tenantChanging ? tenant_id : target.tenant_id
        if (!b || b.tenant_id !== effectiveTenant) return json({ error: 'Branch not found in that business' }, 400)
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name !== undefined) updates.name = name
      if (phone !== undefined) updates.phone = phone
      if (username !== undefined) updates.username = username
      if (role !== undefined) updates.role = role
      if (branch_id !== undefined) updates.branch_id = branch_id || null
      if (is_active !== undefined) updates.is_active = !!is_active
      if (emailChanging) updates.email = email
      if (tenantChanging) updates.tenant_id = tenant_id

      if (emailChanging) {
        const { error: authErr2 } = await admin.auth.admin.updateUserById(user_id, { email, email_confirm: true })
        if (authErr2) return json({ error: `Auth email update failed: ${authErr2.message}` }, 400)
      }
      const { error: updErr } = await admin.from('users').update(updates).eq('id', user_id)
      if (updErr) return json({ error: updErr.message }, 400)

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: 'client_user_updated',
        target_type: 'user',
        target_id: user_id,
        details: { changed: Object.keys(updates).filter((k) => k !== 'updated_at'), email: email ?? target.email },
      })
      return json({ ok: true })
    }

    if (action === 'ban' || action === 'unban') {
      if (callerRow.role !== 'super_admin') return json({ error: 'Super Admin only' }, 403)
      const { user_id } = body
      if (!user_id) return json({ error: 'Missing field: user_id' }, 400)
      const { data: target } = await admin.from('users').select('id, email').eq('id', user_id).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)

      // Ban blocks token refresh immediately; pairing it with is_active
      // keeps the app-level state consistent so the UI reads correctly.
      const { error: banErr } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: action === 'ban' ? '87600h' : 'none',
      })
      if (banErr) return json({ error: banErr.message }, 400)
      await admin.from('users').update({ is_active: action === 'unban' }).eq('id', user_id)

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: action === 'ban' ? 'client_user_banned' : 'client_user_unbanned',
        target_type: 'user',
        target_id: user_id,
        details: { email: target.email },
      })
      return json({ ok: true })
    }

    if (action === 'force_logout') {
      if (callerRow.role !== 'super_admin') return json({ error: 'Super Admin only' }, 403)
      const { user_id } = body
      if (!user_id) return json({ error: 'Missing field: user_id' }, 400)
      const { data: target } = await admin.from('users').select('id, email').eq('id', user_id).maybeSingle()
      if (!target) return json({ error: 'User not found' }, 404)

      // GoTrue admin endpoint — revokes every session/refresh token
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users/${user_id}/logout`, {
        method: 'POST',
        headers: {
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        },
      })
      if (!res.ok && res.status !== 404) {
        return json({ error: `Logout failed (${res.status})` }, 400)
      }

      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: caller.email,
        action: 'client_user_force_logout',
        target_type: 'user',
        target_id: user_id,
        details: { email: target.email },
      })
      return json({ ok: true })
    }

    if (action === 'get_auth_info') {
      const { user_id } = body
      if (!user_id) return json({ error: 'Missing field: user_id' }, 400)
      const { data: info, error: infoErr } = await admin.auth.admin.getUserById(user_id)
      if (infoErr || !info?.user) return json({ error: infoErr?.message || 'Auth record not found' }, 404)
      const u = info.user
      return json({
        ok: true,
        auth: {
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          banned_until: (u as Record<string, unknown>).banned_until ?? null,
          providers: (u.identities || []).map((i) => i.provider),
        },
      })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

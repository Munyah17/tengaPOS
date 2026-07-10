// Super Admin creates platform staff accounts (Admin / Tech Support) directly.
// No invitations — the account is created with a password, ready to sign in.
// Only callers whose app_users role is super_admin may use this.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

    // Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    // Only an active Super Admin may create staff
    const { data: callerRow } = await admin
      .from('app_users')
      .select('role, is_active')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerRow || callerRow.role !== 'super_admin' || !callerRow.is_active) {
      return json({ error: 'Only the Super Admin can create staff accounts' }, 403)
    }

    const { name, email, password, role } = await req.json()
    if (!name || !email || !password || !role) {
      return json({ error: 'Missing required fields: name, email, password, role' }, 400)
    }
    if (!['admin', 'tech_support'].includes(role)) {
      return json({ error: 'Role must be admin or tech_support' }, 400)
    }
    if (String(password).length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    // Create the auth account (is_app_staff stops the tenant signup trigger)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, is_app_staff: 'true' },
    })
    if (createErr) return json({ error: createErr.message }, 400)

    const { error: insertErr } = await admin.from('app_users').insert({
      id: created.user.id,
      name,
      email,
      role,
      is_active: true,
      is_deletable: true,
    })
    if (insertErr) {
      // Roll back the orphaned auth account
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: insertErr.message }, 400)
    }

    await admin.from('audit_logs').insert({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'staff_created',
      target_type: 'app_user',
      target_id: created.user.id,
      details: { name, email, role },
    })

    return json({ ok: true, id: created.user.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

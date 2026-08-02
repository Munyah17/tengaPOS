// Tenant (vendor) staff removal — a Vendor/Shop Manager removes a staff
// member who has left. Soft-deletes the users row (deleted_at) so it stops
// appearing anywhere staff are listed, without breaking the FK references
// from their past orders/job cards/tasks, and bans the auth account so they
// can no longer sign in (is_active alone never blocked login — see
// authStore's loadProfile, which only checks is_locked).
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

    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller) return json({ error: 'Not authenticated' }, 401)

    const { data: callerRow } = await admin
      .from('users')
      .select('tenant_id, role, is_active')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerRow?.is_active || !['vendor', 'shop_manager'].includes(callerRow.role)) {
      return json({ error: 'Only the business owner or a shop manager can remove staff' }, 403)
    }

    const { user_id } = await req.json()
    if (!user_id) return json({ error: 'Missing field: user_id' }, 400)
    if (user_id === caller.id) return json({ error: "You can't remove your own account" }, 400)

    const { data: target } = await admin
      .from('users')
      .select('id, tenant_id, role, name')
      .eq('id', user_id)
      .maybeSingle()
    if (!target || target.tenant_id !== callerRow.tenant_id) {
      return json({ error: 'Staff member not found' }, 404)
    }
    if (target.role === 'vendor') {
      return json({ error: "The business owner's account can't be removed" }, 400)
    }

    const { error: updateErr } = await admin
      .from('users')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', user_id)
    if (updateErr) return json({ error: updateErr.message }, 400)

    // Effectively permanent — Supabase has no "ban forever", so this is the
    // longest ban_duration it accepts (~100 years).
    const { error: banErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: '876000h' })
    if (banErr) return json({ error: banErr.message }, 400)

    return json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

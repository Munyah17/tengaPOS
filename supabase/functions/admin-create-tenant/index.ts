// Super Admin creates a brand-new tenant/vendor account directly from the
// admin portal -- for signups handled over the phone/WhatsApp, or any case
// where a business shouldn't have to go through the public /register flow.
// Creates the tenant, the vendor's auth account + user row, and the main
// branch as one unit -- mirrors handle_new_user's self-signup shape (see
// supabase/migrations/1785683005_signup_trigger_self_heal.sql) but marks the
// tenant active immediately instead of 'pending', since a Super Admin
// creating it directly is itself the approval.
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

function slugify(name: string) {
  return lowerAlnumDash(name) + '-' + crypto.randomUUID().slice(0, 6)
}
function lowerAlnumDash(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business'
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

    const { data: callerRow } = await admin.from('app_users').select('role, is_active').eq('id', caller.id).maybeSingle()
    if (!callerRow?.is_active || callerRow.role !== 'super_admin') {
      return json({ error: 'Only the Super Admin can create tenant accounts directly' }, 403)
    }

    const {
      businessName, ownerName, email, password, phone,
      posMode, planType, features, currency,
    } = await req.json()

    if (!businessName || !ownerName || !email || !password) {
      return json({ error: 'Missing required fields: businessName, ownerName, email, password' }, 400)
    }
    if (String(password).length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

    const cleanPosMode = posMode || 'retail'
    const cleanPlanType = planType || 'standard_plan'

    // Create the auth account (skip_tenant_setup stops the self-signup
    // trigger from also creating a tenant for this user -- see
    // handle_new_user in 1785683005_signup_trigger_self_heal.sql).
    let { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name: ownerName, skip_tenant_setup: 'true' },
    })
    if (createErr?.message?.includes('already been registered')) {
      // Leftover auth.users row with no matching public.users/app_users is
      // an orphan from an earlier failed attempt, not a genuine duplicate --
      // clean it up and retry once. Same check as tenant-add-staff/
      // manage-user/create-staff.
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
            email, password, email_confirm: true,
            user_metadata: { name: ownerName, skip_tenant_setup: 'true' },
          })
          created = retry.data
          createErr = retry.error
        }
      }
    }
    if (createErr) return json({ error: createErr.message }, 400)

    const { data: tenant, error: tenantErr } = await admin.from('tenants').insert({
      name: businessName,
      slug: slugify(businessName),
      status: 'active',
      pos_mode: cleanPosMode,
      enabled_modes: [cleanPosMode],
      plan_type: cleanPlanType,
      features: features || {},
      currency: currency || 'USD',
      is_active: true,
      plan_start_date: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: caller.id,
    }).select().single()
    if (tenantErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: tenantErr.message }, 400)
    }

    const { error: userErr } = await admin.from('users').insert({
      id: created.user.id,
      tenant_id: tenant.id,
      name: ownerName,
      email,
      phone: phone || null,
      role: 'vendor',
      is_active: true,
    })
    if (userErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      await admin.from('tenants').delete().eq('id', tenant.id)
      return json({ error: userErr.message }, 400)
    }

    const { error: branchErr } = await admin.from('branches').insert({
      tenant_id: tenant.id, name: 'Main Branch', is_main: true, is_active: true,
    })
    if (branchErr) {
      // Non-fatal -- the tenant/vendor already exist and can add a branch
      // manually; don't unwind a working account over this.
      console.error('Failed to create main branch:', branchErr.message)
    }

    await admin.from('audit_logs').insert({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'tenant_created_by_admin',
      target_type: 'tenant',
      target_id: tenant.id,
      details: { business_name: businessName, owner_email: email, plan_type: cleanPlanType, pos_mode: cleanPosMode },
    })

    return json({ ok: true, tenant_id: tenant.id, vendor_id: created.user.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})

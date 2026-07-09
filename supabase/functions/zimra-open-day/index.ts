import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Format for FDMS: local datetime without timezone suffix
function fdmsDate(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tenant_id } = await req.json()
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cfg, error: cfgErr } = await supabase
      .from('tenant_fiscal_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'Fiscal device not configured. Set up your ZIMRA credentials in Settings → Fiscalisation.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!cfg.is_registered) {
      return new Response(JSON.stringify({ error: 'Device not registered with ZIMRA. Complete device registration first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cfg.fiscal_day_status === 'open') {
      return new Response(JSON.stringify({ error: 'A fiscal day is already open. Close today\'s day before opening a new one.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fiscalDayNo      = (cfg.fiscal_day_no || 0) + 1
    const openedAt         = new Date()
    const fiscalDayOpened  = fdmsDate(openedAt)

    // FDMS v7.2 OpenDay body: fiscalDayNo (optional) + fiscalDayOpened timestamp
    const baseUrl  = Deno.env.get('ZIMRA_BASE_URL') || 'https://fdmsapitest.zimra.co.zw'
    const zimraUrl = `${baseUrl}/Device/v1/${cfg.device_id}/openday`

    let zimraSuccess = false
    let zimraError: string | null = null

    try {
      const res = await fetch(zimraUrl, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'DeviceID':           String(cfg.device_id),
          'DeviceModelName':    cfg.device_model_name       || 'tengaPOS-v2',
          'DeviceModelVersion': cfg.device_model_version_no || '2.0.0',
        },
        body: JSON.stringify({ fiscalDayNo, fiscalDayOpened }),
      })
      if (res.ok) {
        zimraSuccess = true
      } else {
        const text = await res.text()
        zimraError  = `ZIMRA returned ${res.status}: ${text}`
      }
    } catch (e: unknown) {
      zimraError = `Network error reaching ZIMRA FDMS: ${(e as Error).message}`
    }

    // Always update local state — we track fiscal day regardless of ZIMRA reachability
    const { error: updateErr } = await supabase
      .from('tenant_fiscal_configs')
      .update({
        fiscal_day_status:   'open',
        fiscal_day_no:       fiscalDayNo,
        fiscal_day_opened_at: openedAt.toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)

    if (updateErr) throw updateErr

    if (!zimraSuccess) {
      return new Response(JSON.stringify({
        warning:      zimraError,
        fiscalDayNo,
        fiscalDayOpened,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, fiscalDayNo, fiscalDayOpened }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tenant_id } = await req.json()
    if (!tenant_id) return new Response(JSON.stringify({ error: 'tenant_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Load tenant fiscal config
    const { data: cfg, error: cfgErr } = await supabase
      .from('tenant_fiscal_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!cfg) return new Response(JSON.stringify({ error: 'Fiscal device not configured. Set up your ZIMRA credentials in Settings → Fiscalisation.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!cfg.is_registered) return new Response(JSON.stringify({ error: 'Device not registered with ZIMRA. Complete device registration first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (cfg.fiscal_day_status === 'open') return new Response(JSON.stringify({ error: 'A fiscal day is already open. Close today\'s day before opening a new one.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Call ZIMRA FDMS Open Day endpoint
    const zimraUrl = `https://fdmsapitest.zimra.co.zw/Device/v1/${cfg.device_id}/openday`
    const fiscalDayNo = (cfg.fiscal_day_no || 0) + 1

    let zimraSuccess = false
    let zimraError = null

    try {
      const res = await fetch(zimraUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DeviceID': cfg.device_id,
          'DeviceModelName': cfg.device_model_name || '',
          'DeviceModelVersion': cfg.device_model_version_no || '',
        },
        body: JSON.stringify({ fiscalDayNo }),
      })
      if (res.ok) {
        zimraSuccess = true
      } else {
        const body = await res.text()
        zimraError = `ZIMRA returned ${res.status}: ${body}`
      }
    } catch (e) {
      zimraError = `Network error reaching ZIMRA: ${e.message}`
    }

    // Update DB regardless — track our local state
    const { error: updateErr } = await supabase
      .from('tenant_fiscal_configs')
      .update({
        fiscal_day_status: zimraSuccess ? 'open' : cfg.fiscal_day_status,
        fiscal_day_no: zimraSuccess ? fiscalDayNo : cfg.fiscal_day_no,
      })
      .eq('tenant_id', tenant_id)

    if (updateErr) throw updateErr

    if (!zimraSuccess) {
      return new Response(JSON.stringify({ warning: zimraError, fiscalDayNo: cfg.fiscal_day_no }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, fiscalDayNo }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

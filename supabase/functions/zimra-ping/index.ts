import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tenant_id, deviceID } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let device_id = deviceID
    let model_name = 'tengaPOS-v2'
    let model_version = '2.0.0'

    if (tenant_id) {
      const { data: cfg } = await supabase
        .from('tenant_fiscal_configs')
        .select('device_id, device_model_name, device_model_version_no')
        .eq('tenant_id', tenant_id)
        .maybeSingle()
      if (cfg) {
        device_id = cfg.device_id || device_id
        model_name = cfg.device_model_name || model_name
        model_version = cfg.device_model_version_no || model_version
      }
    }

    if (!device_id) {
      return new Response(JSON.stringify({ error: 'Device ID not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const baseUrl = Deno.env.get('ZIMRA_BASE_URL') || 'https://fdmsapitest.zimra.co.zw'
    const res = await fetch(`${baseUrl}/Device/v1/${device_id}/ping`, {
      method: 'GET',
      headers: {
        'DeviceID': String(device_id),
        'DeviceModelName': model_name,
        'DeviceModelVersion': model_version,
      },
    })

    if (res.ok) {
      return new Response(JSON.stringify({ success: true, status: 'reachable' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await res.text()
    return new Response(
      JSON.stringify({ error: `ZIMRA FDMS returned ${res.status}: ${body}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

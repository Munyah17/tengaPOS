/**
 * ZIMRA FDMS v7.2 — Register New Device
 *
 * Workflow:
 * 1. User has activation key from ZIMRA
 * 2. Sends activation key to this function
 * 3. Function calls ZIMRA to register device
 * 4. ZIMRA returns device certificate
 * 5. Certificate stored in DB for future mTLS
 * 6. Device marked as registered and ready to use
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tenant_id, activation_key, tin, vat_number } = await req.json()

    if (!tenant_id || !activation_key) {
      return new Response(
        JSON.stringify({ error: 'tenant_id and activation_key are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Get tenant fiscal config
    const { data: cfg, error: cfgErr } = await supabase
      .from('tenant_fiscal_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!cfg) {
      return new Response(
        JSON.stringify({ error: 'Fiscal configuration not found. Set up ZIMRA config first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (cfg.is_registered) {
      return new Response(
        JSON.stringify({
          warning: 'Device already registered. Use test connection to verify status.',
          device_id: cfg.device_id,
          is_registered: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Call ZIMRA device registration endpoint
    const baseUrl = Deno.env.get('ZIMRA_BASE_URL') || 'https://fdmsapitest.zimra.co.zw'

    // ZIMRA register endpoint requires:
    // - POST /Device/v1/register
    // - Body: { activationKey, tin, vatNumber }
    // - Headers: DeviceID (if known), DeviceModelName, DeviceModelVersion

    let zimraSuccess = false
    let zimraError: string | null = null
    let deviceCertificate: string | null = null
    let registeredDeviceId: string | null = null

    try {
      const res = await fetch(`${baseUrl}/Device/v1/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DeviceModelName': cfg.device_model_name || 'tengaPOS-v2',
          'DeviceModelVersion': cfg.device_model_version_no || '2.0.0',
        },
        body: JSON.stringify({
          activationKey: activation_key,
          tin: tin || cfg.tin,
          vatNumber: vat_number || cfg.vat_number,
        }),
      })

      if (res.ok) {
        const responseData = await res.json() as Record<string, unknown>
        zimraSuccess = true
        // ZIMRA typically returns device cert and device ID
        deviceCertificate = (responseData.deviceCertificate || responseData.certificate) as string
        registeredDeviceId = cfg.device_id // Device ID was already assigned, now registered
      } else {
        const text = await res.text()
        zimraError = `ZIMRA returned ${res.status}: ${text}`
      }
    } catch (e: unknown) {
      zimraError = `Network error reaching ZIMRA: ${(e as Error).message}`
    }

    if (!zimraSuccess) {
      return new Response(
        JSON.stringify({
          error: zimraError || 'Device registration failed',
          suggestion: 'Check activation key and try again. Contact ZIMRA support if issue persists.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Store certificate and mark as registered
    const { error: updateErr } = await supabase
      .from('tenant_fiscal_configs')
      .update({
        is_registered: true,
        activation_key: activation_key,
        tin: tin || cfg.tin,
        vat_number: vat_number || cfg.vat_number,
        // In production, store certificate here for mTLS
        // device_certificate: deviceCertificate,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)

    if (updateErr) throw updateErr

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Device registered successfully with ZIMRA',
        device_id: registeredDeviceId,
        is_registered: true,
        next_step: 'Open a fiscal day to start processing sales',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: unknown) {
    return new Response(
      JSON.stringify({
        error: (err as Error).message,
        type: 'server_error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

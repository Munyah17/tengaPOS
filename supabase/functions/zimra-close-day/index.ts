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

    const { data: cfg, error: cfgErr } = await supabase
      .from('tenant_fiscal_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (cfgErr) throw cfgErr
    if (!cfg) return new Response(JSON.stringify({ error: 'Fiscal device not configured.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (cfg.fiscal_day_status !== 'open') return new Response(JSON.stringify({ error: 'No fiscal day is currently open.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Get day totals from today's transactions
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: txData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('tenant_id', tenant_id)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())

    const receiptCount = txData?.length ?? 0
    const totalSales = txData?.reduce((s, t) => s + parseFloat(t.amount), 0) ?? 0

    const zimraUrl = `https://fdmsapitest.zimra.co.zw/Device/v1/${cfg.device_id}/closeday`

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
        body: JSON.stringify({
          fiscalDayNo: cfg.fiscal_day_no,
          receiptCount,
          totalSales,
        }),
      })
      if (res.ok) {
        zimraSuccess = true
      } else {
        const body = await res.text()
        zimraError = `ZIMRA returned ${res.status}: ${body}`
      }
    } catch (e) {
      zimraError = `Network error: ${e.message}`
    }

    const { error: updateErr } = await supabase
      .from('tenant_fiscal_configs')
      .update({
        fiscal_day_status: zimraSuccess ? 'closed' : cfg.fiscal_day_status,
      })
      .eq('tenant_id', tenant_id)

    if (updateErr) throw updateErr

    if (!zimraSuccess) {
      return new Response(JSON.stringify({ warning: zimraError }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, fiscalDayNo: cfg.fiscal_day_no, receiptCount, totalSales }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

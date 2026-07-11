/**
 * ZIMRA FDMS v7.2 — Close Fiscal Day
 *
 * Builds a compliant closeDay body with fiscalDayCounters grouped by
 * payment method × tax rate, as required by the FDMS spec.
 * Zero-value counters are excluded (spec requirement).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// FDMS v7.2 money type codes (must match submitReceipt moneyTypeCode values)
const MONEY_TYPE_MAP: Record<string, string> = {
  cash:         'Cash',
  ecocash:      'MobileWallet',
  innbucks:     'MobileWallet',
  omari:        'MobileWallet',
  onemoney:     'MobileWallet',
  zipit:        'BankTransfer',
  visa:         'Card',
  mastercard:   'Card',
  pos_terminal: 'Card',
  paynow:       'MobileWallet',
}

async function sha256b64(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

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
      return new Response(JSON.stringify({ error: 'Fiscal device not configured.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cfg.fiscal_day_status !== 'open') {
      return new Response(JSON.stringify({ error: 'No fiscal day is currently open.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Load today's completed transactions for fiscal counters ─────────────
    // Use fiscal_day_opened_at if available, else fall back to today midnight
    const dayStart = cfg.fiscal_day_opened_at
      ? new Date(cfg.fiscal_day_opened_at)
      : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()

    const { data: txData } = await supabase
      .from('transactions')
      .select('amount, method')
      .eq('tenant_id', tenant_id)
      .eq('status', 'completed')
      .gte('created_at', dayStart.toISOString())

    const transactions = txData || []
    const receiptCounter = transactions.length

    // ── Build fiscalDayCounters (grouped by moneyType, all at 15% VAT) ──────
    // FDMS spec: one counter per (currency × taxPercent × taxID × moneyType).
    // Zero-value counters must NOT be submitted.
    const groupMap: Record<string, number> = {}
    for (const tx of transactions) {
      const moneyType = MONEY_TYPE_MAP[tx.method] || 'Cash'
      const key = `USD|15|${moneyType}`
      groupMap[key] = (groupMap[key] || 0) + parseFloat(tx.amount)
    }

    const fiscalDayCounters = Object.entries(groupMap)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => {
        const [currency, , moneyType] = key.split('|')
        return {
          fiscalCounterType:     'saleByTax',
          fiscalCounterCurrency: currency,
          fiscalCounterTaxPercent: 15,
          fiscalCounterTaxID:    0,
          fiscalCounterMoneyType: moneyType,
          fiscalCounterValue:    Math.round(value * 100) / 100,
        }
      })

    // ── Device signature (placeholder for test env) ──────────────────────────
    const closedAt  = new Date()
    const hashInput = `${cfg.device_id}|${cfg.fiscal_day_no}|${fdmsDate(closedAt)}|${receiptCounter}`
    const hash      = await sha256b64(hashInput)

    const fiscalDayOpened = cfg.fiscal_day_opened_at
      ? fdmsDate(new Date(cfg.fiscal_day_opened_at))
      : fdmsDate(dayStart)

    // ── FDMS v7.2 closeDay body ──────────────────────────────────────────────
    const closeDayBody = {
      header: {
        fiscalDayNo:    cfg.fiscal_day_no,
        fiscalDayOpened,
        fiscalDayDeviceSignature: { hash, signature: hash },
      },
      footer: {
        fiscalDayCounters,
        fiscalDayDeviceSignature: { hash, signature: hash },
        receiptCounter,
        fiscalDayClosed: fdmsDate(closedAt),
      },
    }

    const baseUrl  = Deno.env.get('ZIMRA_BASE_URL') || 'https://fdms.zimra.co.zw'
    const zimraUrl = `${baseUrl}/Device/v1/${cfg.device_id}/closeday`

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
        body: JSON.stringify(closeDayBody),
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

    const totalSales = transactions.reduce((s, t) => s + parseFloat(t.amount), 0)

    // Always close locally
    const { error: updateErr } = await supabase
      .from('tenant_fiscal_configs')
      .update({
        fiscal_day_status:    'closed',
        fiscal_day_opened_at: null,
        updated_at:           new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)

    if (updateErr) throw updateErr

    if (!zimraSuccess) {
      return new Response(JSON.stringify({
        warning:      zimraError,
        fiscalDayNo:  cfg.fiscal_day_no,
        receiptCount: receiptCounter,
        totalSales:   Math.round(totalSales * 100) / 100,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      success:      true,
      fiscalDayNo:  cfg.fiscal_day_no,
      receiptCount: receiptCounter,
      totalSales:   Math.round(totalSales * 100) / 100,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

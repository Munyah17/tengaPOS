/**
 * ZIMRA FDMS v7.2 — Submit Receipt (Virtual Fiscal Device)
 *
 * Builds a compliant FDMS receipt payload and submits it to ZIMRA.
 * Falls back gracefully if FDMS is unreachable (offline-tolerant).
 * Always increments the receipt counter in DB so the sequence stays correct.
 *
 * mTLS note: the test environment (fdmsapitest.zimra.co.zw) does not enforce
 * the device certificate. Production requires loading the PEM cert/key from DB
 * and attaching it to the fetch call — add that when going live.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// FDMS v7.2 money type codes
const MONEY_TYPE_MAP: Record<string, string> = {
  cash:        'Cash',
  ecocash:     'MobileWallet',
  innbucks:    'MobileWallet',
  omari:       'MobileWallet',
  onemoney:    'MobileWallet',
  zipit:       'BankTransfer',
  visa:        'Card',
  mastercard:  'Card',
  pos_terminal:'Card',
  paynow:      'MobileWallet',
}

// SHA-256 → base64 helper (Deno Web Crypto)
async function sha256b64(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

// Format a JS Date to FDMS local datetime (no timezone suffix)
function fdmsDate(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { tenant_id, receipt: receiptInput } = body

    if (!tenant_id || !receiptInput) {
      return new Response(JSON.stringify({ error: 'tenant_id and receipt are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
    if (!cfg) {
      return new Response(JSON.stringify({ error: 'Fiscal device not configured. Set up ZIMRA credentials in Settings → Fiscalisation.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!cfg.is_enabled) {
      return new Response(JSON.stringify({ error: 'Fiscalisation is not enabled for this account.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!cfg.is_registered) {
      return new Response(JSON.stringify({ error: 'Device not registered with ZIMRA. Complete device registration first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (cfg.fiscal_day_status !== 'open') {
      return new Response(JSON.stringify({ error: 'Fiscal day is not open. Open a fiscal day before processing sales.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newGlobalNo = (cfg.last_receipt_global_no || 0) + 1
    const receiptDate = fdmsDate(new Date(receiptInput.date || Date.now()))
    const moneyType = MONEY_TYPE_MAP[receiptInput.paymentMethod] || 'Cash'
    const deviceId = String(cfg.device_id)

    // ── Build receipt lines ─────────────────────────────────────────────────
    // Shelf prices in POS are VAT-INCLUSIVE (the customer-facing price already
    // contains VAT — never added on top), so receiptLinesTaxInclusive must be
    // true and taxPercent must match the tenant's actual current rate (VAT
    // rose to 15.5% from 1 Jan 2026 — was previously hardcoded to the old 15%,
    // which also disagreed with the tax-exclusive flag below it).
    // Only taxID 2 / code D (standard-rated) is verified against this
    // project's working FDMS integration. Zero-rated/exempt codes are NOT
    // guessed here — if a tenant disables VAT, we still report under the
    // same verified code at 0%, rather than fabricate an unverified one.
    const vatRate = receiptInput.vatRate ?? 15.5

    const receiptLines = (receiptInput.items || []).map((item: {
      name: string; price: number; quantity: number; hsCode?: string
    }) => ({
      receiptLineType:      'Sale',
      receiptLineName:      item.name,
      receiptLineHSCode:    item.hsCode || '000000',
      receiptLineQuantity:  item.quantity,
      receiptLineUnitPrice: Math.round(item.price * 100) / 100,
      taxPercent:           vatRate,
      taxID:                2,        // FDMS v7.2 taxID 2 = standard-rated VAT (code D)
      receiptLineTotal:     Math.round(item.price * item.quantity * 100) / 100,
    }))

    // ── Tax summary ──────────────────────────────────────────────────────────
    const taxableAmount = Math.round((receiptInput.subtotal || 0) * 100) / 100
    const taxAmount     = Math.round((receiptInput.tax     || 0) * 100) / 100
    const receiptTaxes  = [
      {
        taxCode:    'D',
        taxPercent: vatRate,
        taxID:      2,
        taxAmount,
        taxableAmount,
      },
    ]

    // ── Device signature (placeholder for test env) ─────────────────────────
    // Production: sign the hash with the device RSA private key (from DB).
    const hashInput = `${deviceId}|${cfg.fiscal_day_no}|${newGlobalNo}|${receiptDate}|${receiptInput.total}`
    const hash      = await sha256b64(hashInput)

    // ── Full FDMS v7.2 receipt payload ──────────────────────────────────────
    const fdmsPayload = {
      receipt: {
        deviceID:               deviceId,
        receiptType:            'FISCALINVOICE',
        receiptCurrency:        receiptInput.currency || 'USD',
        receiptCounter:         newGlobalNo,
        receiptGlobalNo:        newGlobalNo,
        invoiceNo:              receiptInput.receiptNumber || `RCP-${newGlobalNo}`,
        receiptDate,
        receiptLinesTaxInclusive: true,
        receiptNotes:           '',
        receiptLines,
        receiptTaxes,
        receiptPayments: [
          {
            moneyTypeCode:  moneyType,
            paymentAmount:  Math.round((receiptInput.total || 0) * 100) / 100,
          },
        ],
        receiptDeviceSignature: { hash, signature: hash },
      },
    }

    // ── Submit to FDMS ───────────────────────────────────────────────────────
    const baseUrl  = Deno.env.get('ZIMRA_BASE_URL') || 'https://fdms.zimra.co.zw'
    const fdmsUrl  = `${baseUrl}/Device/v1/${deviceId}/submitreceipt`

    let fdmsSuccess  = false
    let fdmsResponse: Record<string, unknown> | null = null
    let fdmsError: string | null = null

    try {
      const res = await fetch(fdmsUrl, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'DeviceID':           deviceId,
          'DeviceModelName':    cfg.device_model_name    || 'tengaPOS-v2',
          'DeviceModelVersion': cfg.device_model_version_no || '2.0.0',
        },
        body: JSON.stringify(fdmsPayload),
      })

      if (res.ok) {
        fdmsResponse = await res.json()
        fdmsSuccess  = true
      } else {
        const text = await res.text()
        fdmsError   = `ZIMRA returned ${res.status}: ${text}`
      }
    } catch (e: unknown) {
      fdmsError = `Network error reaching ZIMRA FDMS: ${(e as Error).message}`
    }

    // ── Persist counter + FDMS hash to DB (always, even on FDMS failure) ────
    const fdmsHash = (fdmsResponse?.receiptFDMSSignature as { hash?: string } | undefined)?.hash || hash
    await supabase
      .from('tenant_fiscal_configs')
      .update({
        last_receipt_global_no: newGlobalNo,
        last_receipt_hash:      fdmsHash,
        updated_at:             new Date().toISOString(),
      })
      .eq('tenant_id', tenant_id)

    // ── Build QR verification URL ────────────────────────────────────────────
    const receiptQrUrl =
      (fdmsResponse?.receiptQrUrl as string | undefined) ||
      `https://fdms.zimra.co.zw/Receipt/Find?receiptGlobalNo=${newGlobalNo}&deviceID=${deviceId}`

    return new Response(JSON.stringify({
      success:        fdmsSuccess,
      receiptGlobalNo: newGlobalNo,
      receiptQrUrl,
      fdmsHash,
      ...(fdmsError ? { warning: fdmsError } : {}),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

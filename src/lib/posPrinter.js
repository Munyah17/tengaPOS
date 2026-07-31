// Direct printing to the built-in printer on all-in-one POS terminals,
// bypassing the OS print dialog entirely.
//
// Transports, selected by the tenant's Printer Connection setting:
// 1. TengaPOS Print Agent — a small local helper (see /print-agent) that
//    runs on the till and forwards raw bytes to the Windows print spooler
//    as a RAW job, so it works no matter which driver the printer has
//    installed. This is the primary path on Windows tills (tried by default
//    for any connection type other than 'bluetooth'/'rawbt').
// 2. WebUSB — talks to the printer directly over USB with no agent needed.
//    Falls back from the agent automatically.
// 3. Web Bluetooth ('bluetooth') — BLE only, per the W3C spec; most cheap
//    generic thermal printers use classic Bluetooth (SPP) instead and are
//    invisible to this transport no matter what.
// 4. RawBT ('rawbt') — hands raw bytes to the RawBT Android app via its URL
//    scheme, which talks to classic-Bluetooth printers directly. This is
//    the practical option for cheap Android tablet + cheap BT thermal
//    printer setups (e.g. MPT-11) with no native app development needed.
// None of the direct transports work in Safari/Firefox or on iOS; those
// keep using "Print Receipt" (the OS print dialog).

const ESC = 0x1b
const GS = 0x1d
const PRINT_AGENT_URL = 'http://127.0.0.1:38471'

// Standard thermal/receipt paper widths and their printable character count
// at the printer's normal Font A (12x24 dots) — used both for the Receipts
// Config paper-size picker and to pad/align receipt columns so totals don't
// drift left with a big gap (58mm) or run out of room (110mm).
export const PAPER_SIZES = [
  { mm: 44, chars: 24, label: '44mm — Mobile compact' },
  { mm: 48, chars: 28, label: '48mm — Mobile' },
  { mm: 56, chars: 30, label: '56mm — Compact' },
  { mm: 58, chars: 32, label: '58mm — Standard mobile/small (most common)' },
  { mm: 60, chars: 33, label: '60mm' },
  { mm: 70, chars: 40, label: '70mm' },
  { mm: 76, chars: 42, label: '76mm' },
  { mm: 80, chars: 48, label: '80mm — Standard desktop (most common)' },
  { mm: 82, chars: 49, label: '82mm' },
  { mm: 110, chars: 66, label: '110mm — Wide' },
]

export function paperWidthToChars(mm) {
  const match = PAPER_SIZES.reduce((closest, size) =>
    Math.abs(size.mm - mm) < Math.abs(closest.mm - mm) ? size : closest, PAPER_SIZES[7])
  return match.chars
}

export const PRINTER_CONNECTIONS = [
  { key: 'usb', label: 'USB' },
  { key: 'lpt1', label: 'LPT1 (parallel port)' },
  { key: 'network', label: 'Network (Ethernet)' },
  { key: 'wifi', label: 'Wi-Fi' },
  // "Bluetooth" here means Web Bluetooth (BLE) directly from the browser —
  // only works for printers that speak Bluetooth Low Energy. Most cheap/
  // generic thermal printers (e.g. MPT-11) use classic Bluetooth (SPP)
  // instead, which no browser can reach at all — those need RawBT or Print Bridge.
  { key: 'bluetooth', label: 'Bluetooth (BLE — rare on cheap printers)' },
  { key: 'serial', label: 'Serial (RS-232 / Bluetooth paired as COM port)' },
  { key: 'bridge', label: 'Print Bridge (Windows agent or Android app)' },
  // Android + classic-Bluetooth ESC/POS printer (most cheap generic thermal
  // printers, e.g. MPT-11) — hands the raw bytes to the RawBT app via its
  // documented URL scheme instead of talking to the printer directly, which
  // sidesteps Web Bluetooth's BLE-only limitation entirely. Requires
  // installing "RawBT Print Service" from the Play Store and setting it as
  // default for the paired printer once — no APK building needed.
  { key: 'rawbt', label: 'RawBT (Android — cheap Bluetooth thermal printers)' },
]

function escPosInit() {
  return [ESC, 0x40] // ESC @ — initialize printer
}
function escPosDensity() {
  // ESC 7 n1 n2 n3 — heating dots / heating time / heating interval.
  // Clone thermal printers often power on with a faint factory default;
  // this pushes heating time up for darker, more legible print.
  return [ESC, 0x37, 0x07, 0xc8, 0x02]
}
function escPosFont() {
  return [ESC, 0x4d, 0x00] // ESC M 0 — Font A: the standard, clearer typeface (vs condensed Font B)
}
function escPosNormalSize() {
  return [GS, 0x21, 0x00] // GS ! 0 — normal 1x1 size, not double width/height
}
function escPosAlign(center) {
  return [ESC, 0x61, center ? 0x01 : 0x00] // ESC a n
}
function escPosBold(on) {
  return [ESC, 0x45, on ? 0x01 : 0x00] // ESC E n
}
function escPosCut() {
  return [GS, 0x56, 0x00] // GS V 0 — full cut
}
function escPosFeed(lines = 3) {
  return Array(lines).fill(0x0a)
}

/**
 * Builds raw ESC/POS bytes from `lines` — an array of { text, bold, center }
 * objects (or plain strings, treated as normal left-aligned lines).
 */
function buildEscPosBytes(lines) {
  const bytes = []
  bytes.push(...escPosInit())
  bytes.push(...escPosDensity())
  bytes.push(...escPosFont())
  bytes.push(...escPosNormalSize())
  for (const line of lines) {
    const { text, bold, center } = typeof line === 'string' ? { text: line } : line
    bytes.push(...escPosAlign(!!center))
    bytes.push(...escPosBold(!!bold))
    bytes.push(...new TextEncoder().encode(text))
    bytes.push(0x0a)
  }
  bytes.push(...escPosFeed(3))
  bytes.push(...escPosCut())
  return new Uint8Array(bytes)
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Whether the local Print Agent responds on this machine right now. */
export async function isPrintAgentRunning() {
  try {
    const res = await fetchWithTimeout(`${PRINT_AGENT_URL}/status`, {}, 1500)
    return res.ok
  } catch {
    return false
  }
}

async function printViaAgent(bytes, comPort) {
  const res = await fetchWithTimeout(`${PRINT_AGENT_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // comPort routes to Send-BytesToSerialPort in the Windows agent — used
    // for a classic-Bluetooth (SPP) printer paired as a virtual COM port,
    // since that bypasses the Windows print spooler/driver entirely (there's
    // no "printer object" for a bare serial port). Omitted, the agent falls
    // back to the default/named Windows printer via the spooler as before.
    body: JSON.stringify(comPort ? { data: bytesToBase64(bytes), comPort } : { data: bytesToBase64(bytes) }),
  }, 8000)
  const result = await res.json().catch(() => null)
  if (!res.ok || !result?.ok) {
    throw new Error(result?.error || 'Print Agent could not reach the printer')
  }
}

export function isWebUsbSupported() {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

// Kept for compatibility with anything checking whether direct printing is
// possible at all on this device — WebUSB is one of two transports now.
export function isPosPrinterSupported() {
  return true
}

/** A device the user already granted permission for, if any — checking
 *  this first avoids re-prompting the USB picker on every single receipt. */
export async function getPairedPosPrinter() {
  if (!isWebUsbSupported()) return null
  const devices = await navigator.usb.getDevices()
  return devices[0] || null
}

/** Opens the browser's USB device picker so the cashier can select the
 *  built-in printer once — the browser remembers the grant after that. */
export async function pairPosPrinter() {
  if (!isWebUsbSupported()) {
    throw new Error('This browser can\'t talk to USB devices directly — use Chrome or Edge.')
  }
  return navigator.usb.requestDevice({ filters: [] })
}

async function findBulkOutEndpoint(device) {
  await device.open()
  if (!device.configuration) await device.selectConfiguration(1)

  for (const iface of device.configuration.interfaces) {
    const alt = iface.alternates[0]
    const outEndpoint = alt.endpoints.find((e) => e.direction === 'out')
    if (!outEndpoint) continue
    try {
      await device.claimInterface(iface.interfaceNumber)
      return { interfaceNumber: iface.interfaceNumber, endpointNumber: outEndpoint.endpointNumber }
    } catch {
      // Interface already claimed by the OS driver or another app — try the next one
    }
  }
  return null
}

async function printViaWebUsb(bytes) {
  let device = await getPairedPosPrinter()
  if (!device) device = await pairPosPrinter()
  if (!device) throw new Error('No printer selected')

  const endpoint = await findBulkOutEndpoint(device)
  if (!endpoint) {
    throw new Error('Connected, but couldn\'t find a usable printer interface — it\'s likely claimed by a Windows driver. Install the TengaPOS Print Agent for reliable printing on this till instead.')
  }

  try {
    await device.transferOut(endpoint.endpointNumber, bytes)
  } finally {
    try { await device.close() } catch { /* best-effort */ }
  }
}

// Most generic/white-label ESC/POS Bluetooth thermal printers expose a
// serial-over-BLE profile using this service/characteristic pair (the same
// one used by countless open-source ESC/POS BLE projects). Printers with a
// genuinely different GATT profile won't be found by this filter — there's
// no universal BLE printer standard the way there is for USB.
const BLE_PRINTER_SERVICE_UUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455'
const BLE_PRINTER_WRITE_CHAR_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3'
const BLE_WRITE_CHUNK_SIZE = 180 // conservative — under the default BLE MTU most printers negotiate

export function isWebBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

async function printViaBluetooth(bytes) {
  if (!isWebBluetoothSupported()) {
    throw new Error('This browser can\'t talk to Bluetooth devices directly — use Chrome or Edge.')
  }

  let device
  try {
    // Fast path: filter directly on the common ESC/POS BLE service most
    // generic/white-label thermal printers expose.
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_PRINTER_SERVICE_UUID] }],
    })
  } catch (filterErr) {
    // No nearby device advertises that exact service — doesn't mean there's
    // no printer, just that this specific model's GATT profile differs (very
    // common; there's no single BLE printer standard). Fall back to letting
    // the user pick from every nearby BLE device, and probe it for our
    // characteristic once connected instead of filtering up front.
    if (filterErr.name === 'NotFoundError') {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BLE_PRINTER_SERVICE_UUID],
      })
    } else {
      throw filterErr
    }
  }

  const server = await device.gatt.connect()
  try {
    const service = await server.getPrimaryService(BLE_PRINTER_SERVICE_UUID)
    const characteristic = await service.getCharacteristic(BLE_PRINTER_WRITE_CHAR_UUID)
    for (let i = 0; i < bytes.length; i += BLE_WRITE_CHUNK_SIZE) {
      await characteristic.writeValueWithoutResponse(bytes.slice(i, i + BLE_WRITE_CHUNK_SIZE))
    }
  } catch (serviceErr) {
    throw new Error(`Connected to "${device.name || 'the printer'}", but it doesn't support the standard ESC/POS Bluetooth profile TengaPOS expects. (${serviceErr.message})`)
  } finally {
    server.disconnect()
  }
}

// RawBT (Play Store: "RawBT Print Service") is a widely-used Android app
// built exactly for this: a web page hands it raw ESC/POS bytes via a
// custom URL scheme, and RawBT forwards them to whatever printer it's
// configured for — including classic-Bluetooth printers Web Bluetooth can
// never see, with no APK building or native bridge required. The printer
// manufacturer's own manual for the MPT-II lists RawBT by name as a
// supported app. One-time setup on the till: install RawBT, pair the
// printer in Android's Bluetooth settings (PIN usually 0000), open RawBT
// and select it as the default printer.
function printViaRawBT(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  // Custom URL scheme hand-off — Android intercepts this and offers to open
  // RawBT (or opens it directly if it's the only/default handler). There's
  // no JS-visible success/failure signal for a scheme hand-off like this;
  // RawBT itself surfaces any printer-side error (not paired, out of paper,
  // etc.) in its own UI/notification once it receives the job.
  window.location.href = `rawbt:base64,${base64}`
}

/**
 * Prints plain receipt text to the built-in printer. `lines` is an array of
 * { text, bold, center } objects (or plain strings) — the caller builds
 * these from the same receipt data used for the regular print/preview.
 * `connectionHint` (from Receipts Config) picks the transport to try first:
 * 'bluetooth' goes straight to WebBluetooth (the Print Agent/WebUSB can't
 * reach a BLE device); everything else tries the Print Agent first, then
 * WebUSB — both of those work the same regardless of USB/LPT1/network,
 * since Windows' print spooler already abstracts those differences away.
 */
export async function printToPosPrinter(lines, connectionHint, comPort) {
  const bytes = buildEscPosBytes(lines)

  if (connectionHint === 'bluetooth') {
    await printViaBluetooth(bytes)
    return
  }

  if (connectionHint === 'rawbt') {
    printViaRawBT(bytes)
    return
  }

  try {
    await printViaAgent(bytes, comPort)
    return
  } catch (agentErr) {
    if (!isWebUsbSupported()) {
      throw new Error(`Couldn't reach the TengaPOS Print Agent on this device. Install it from /print-agent and make sure it's running, or use "Print Receipt" instead. (${agentErr.message})`)
    }
    // Fall through to WebUSB
  }

  try {
    await printViaWebUsb(bytes)
  } catch (usbErr) {
    throw new Error(`Print Agent not running, and direct USB printing failed: ${usbErr.message}`)
  }
}

// Retained for any existing callers — now just the WebUSB-only path.
export async function printRawToPosPrinter(lines) {
  await printViaWebUsb(buildEscPosBytes(lines))
}

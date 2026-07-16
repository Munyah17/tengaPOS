// Direct printing to the built-in printer on all-in-one POS terminals,
// bypassing the OS print dialog entirely. window.print() only works when
// the printer is a properly-installed OS printer — many embedded
// terminals (Windows or Android) expose their built-in thermal printer as
// a raw USB device instead, which the standard print dialog never sees.
//
// Uses WebUSB (Chrome/Edge desktop, and Chrome on Android) to talk to the
// printer directly with raw ESC/POS commands — the same protocol nearly
// all thermal receipt printers understand. Not supported in Safari/Firefox
// or on iOS at all; those must keep using the regular "Print Receipt" button.

const ESC = 0x1b
const GS = 0x1d

function escPosInit() {
  return [ESC, 0x40] // ESC @ — initialize printer
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

export function isPosPrinterSupported() {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

/** A device the user already granted permission for, if any — checking
 *  this first avoids re-prompting the USB picker on every single receipt. */
export async function getPairedPosPrinter() {
  if (!isPosPrinterSupported()) return null
  const devices = await navigator.usb.getDevices()
  return devices[0] || null
}

/** Opens the browser's USB device picker so the cashier can select the
 *  built-in printer once — the browser remembers the grant after that. */
export async function pairPosPrinter() {
  if (!isPosPrinterSupported()) {
    throw new Error('This browser can\'t talk to the printer directly — use Chrome or Edge.')
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

/**
 * Prints plain receipt text directly to the paired USB thermal printer.
 * `lines` is an array of { text, bold, center } objects (or plain strings,
 * treated as normal left-aligned lines) — the caller builds these from the
 * same receipt data used for the regular print/preview.
 */
export async function printRawToPosPrinter(lines) {
  let device = await getPairedPosPrinter()
  if (!device) device = await pairPosPrinter()
  if (!device) throw new Error('No printer selected')

  const endpoint = await findBulkOutEndpoint(device)
  if (!endpoint) {
    throw new Error('Connected, but couldn\'t find a usable printer interface. It may already be claimed by a Windows driver — try uninstalling/disabling that driver, or use "Print Receipt" instead.')
  }

  const bytes = []
  bytes.push(...escPosInit())
  for (const line of lines) {
    const { text, bold, center } = typeof line === 'string' ? { text: line } : line
    bytes.push(...escPosAlign(!!center))
    bytes.push(...escPosBold(!!bold))
    bytes.push(...new TextEncoder().encode(text))
    bytes.push(0x0a)
  }
  bytes.push(...escPosFeed(3))
  bytes.push(...escPosCut())

  try {
    await device.transferOut(endpoint.endpointNumber, new Uint8Array(bytes))
  } finally {
    try { await device.close() } catch { /* best-effort */ }
  }
}

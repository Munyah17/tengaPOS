# TengaPOS Print Bridge (Android)

Solves one specific problem: cheap/generic Bluetooth thermal printers (like
the MPT-11) use **classic Bluetooth (SPP)**, not BLE. Chrome's Web Bluetooth
API can only see BLE devices — that's a W3C spec limitation baked into every
Chromium browser, not something fixable from the web app. This app does the
one thing a browser can't: hold a classic Bluetooth socket open to the
printer and forward raw ESC/POS bytes to it.

**Before building this: try RawBT first.** RawBT (Play Store: "RawBT Print
Service") solves the exact same problem with zero development — TengaPOS
already supports it as a "Printer Connection" option in Settings → Receipts.
It's the practical choice for a cheap tablet with no dev environment set up.
This custom app only matters if RawBT's ESC/POS support doesn't fit some
specific printer or workflow, or you want the extra endpoints (cash drawer,
future peripherals) under your own control instead of a third-party app.

## Why the web app needs zero changes

This app runs a tiny local HTTP server on `127.0.0.1:38471` — the exact same
port and request/response contract as the existing Windows till helper
(`print-agent/TengaPOS-PrintAgent.ps1`):

- `GET /status` → `{ ok: true, ... }`
- `POST /print` with `{ "data": "<base64 ESC/POS bytes>" }` → `{ ok: true }` or `{ ok: false, error }`

`src/lib/posPrinter.js` already tries this URL first for every printer
connection type except literal `"bluetooth"`. So: install this app, pair the
printer once in **Android's own Bluetooth settings** (not in the browser),
pick it in this app, hit Start — and the *already-deployed* TengaPOS web app
starts printing to it with no code changes on the web side at all.

## Setup on the till

1. **Pair the printer normally first.** Android Settings → Bluetooth → pair
   the MPT-11 (or whatever printer) like any other Bluetooth device. This
   step already works fine — it was never the problem.
2. Install this app's APK (build it via Android Studio: File → Open →
   select this `print-bridge-android` folder → Build → Build APK).
3. Open the app, grant the Bluetooth permission prompt.
4. Tap the printer in the "Paired devices" list to select it.
5. Tap **Start Bridge**. It shows a persistent notification while running —
   that's the foreground service keeping the local server alive.
6. In the TengaPOS web app: **Settings → Receipts → Printer Connection** —
   set this to anything other than "Bluetooth" (e.g. leave it on the
   default). The "Bluetooth" option in that dropdown means *try Web
   Bluetooth directly*, which is exactly the path that doesn't work for this
   class of printer — every other option tries this bridge first.
7. Ring up a sale, tap **POS Printer** on the receipt. It should print.

## Extending to other hardware

The same Bluetooth socket this app already holds to the printer can serve
more than printing, without adding new pairings or hardware:

- **Cash drawer** — most thermal printers have an RJ11/RJ12 port a drawer
  plugs into, kicked by sending a specific ESC/POS byte sequence *to the
  printer itself* (see the `/drawer/open` stub in `PrintBridgeService.kt` —
  already implemented, sends the standard `ESC p 0 25 250` kick command).
- **Barcode scanners** — the overwhelming majority of Bluetooth barcode
  scanners ship in "HID keyboard emulation" mode: once paired in Android
  Bluetooth settings, they just type scanned codes into whatever text field
  has focus, including directly into the TengaPOS web app's own search box.
  No bridge involvement needed at all for these.
- **Customer-facing display** — out of scope for now; would be a second
  endpoint (e.g. `/display/show`) plus either a second Activity on a
  secondary display (tablets with HDMI-out) or a small always-on-top window.

## Project layout

- `PrintBridgeService.kt` — the foreground service: NanoHTTPD server +
  classic Bluetooth (RFCOMM/SPP) connection to the selected printer.
- `MainActivity.kt` — pick a paired device, start/stop the bridge.
- `BootReceiver.kt` — restarts the bridge after a reboot if a printer was
  already configured, so a power cut doesn't silently disable printing.

## Building

Open this folder (`print-bridge-android/`) directly in Android Studio —
it's a standard Gradle project. Android Studio will offer to regenerate the
Gradle wrapper JAR on first open if it's missing; accept that prompt. Target
is minSdk 23 (Android 6.0+), matching the same legacy-device floor as the
main TengaPOS web app.

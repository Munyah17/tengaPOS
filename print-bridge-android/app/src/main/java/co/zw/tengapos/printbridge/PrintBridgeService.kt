package co.zw.tengapos.printbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/**
 * Runs a tiny local HTTP server on 127.0.0.1:38471 — the SAME port and
 * request/response contract as print-agent/TengaPOS-PrintAgent.ps1 (the
 * Windows till agent). src/lib/posPrinter.js already tries this URL first
 * for every printer connection type except literal "bluetooth" — so once
 * this service is running on an Android till, direct printing just starts
 * working with ZERO changes to the web app.
 *
 * Why a bridge app at all: MPT-11 and most cheap/generic thermal printers
 * use classic Bluetooth (SPP/RFCOMM), not BLE. Chrome's Web Bluetooth API
 * can only see BLE devices — that's a W3C spec limitation, not something
 * fixable from web code. Android's native BluetoothSocket API has no such
 * restriction, so this app does the one thing a browser can't: hold a
 * classic Bluetooth connection to the printer and forward raw ESC/POS bytes
 * to it on request.
 */
class PrintBridgeService : Service() {

    companion object {
        const val PORT = 38471
        const val CHANNEL_ID = "tengapos_print_bridge"
        const val NOTIF_ID = 1
        // Standard Serial Port Profile UUID — universal across SPP devices,
        // this is not printer-specific.
        val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        const val PREFS = "tengapos_print_bridge"
        const val PREF_PRINTER_MAC = "printer_mac"

        var isRunning = false
            private set
    }

    private var server: BridgeHttpServer? = null
    private lateinit var prefs: SharedPreferences

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIF_ID, buildNotification())
        if (server == null) {
            server = BridgeHttpServer()
            try {
                server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
                isRunning = true
                Log.i("PrintBridge", "Listening on 127.0.0.1:$PORT")
            } catch (e: IOException) {
                Log.e("PrintBridge", "Failed to start server on port $PORT", e)
            }
        }
        // START_STICKY: if Android kills this service under memory pressure,
        // restart it — a till with the app "running" but silently dead is
        // worse than a visible crash, since nothing would ever print again
        // until someone noticed and manually reopened the app.
        return START_STICKY
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "TengaPOS Print Bridge", NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(channel)
        }
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TengaPOS Print Bridge running")
            .setContentText("Ready to print to your Bluetooth thermal printer")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }

    /**
     * Sends raw bytes to the currently-paired printer over classic
     * Bluetooth (SPP). The device must already be bonded via Android's own
     * Bluetooth settings — this only opens a connection to an existing
     * pairing, it doesn't do discovery/pairing itself (that's exactly the
     * one part of Web Bluetooth that already worked fine; the OS-level
     * pairing was never the problem).
     */
    private fun sendToPrinter(bytes: ByteArray): Result<Unit> {
        val mac = prefs.getString(PREF_PRINTER_MAC, null)
            ?: return Result.failure(Exception("No printer selected — open the TengaPOS Print Bridge app and pick your printer from the paired devices list"))

        val adapter = BluetoothAdapter.getDefaultAdapter()
            ?: return Result.failure(Exception("This device has no Bluetooth adapter"))
        if (!adapter.isEnabled) {
            return Result.failure(Exception("Bluetooth is turned off on this device"))
        }

        val device: BluetoothDevice = try {
            adapter.getRemoteDevice(mac)
        } catch (e: IllegalArgumentException) {
            return Result.failure(Exception("Saved printer address is invalid — re-select it in the app"))
        }

        var socket: BluetoothSocket? = null
        return try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            // Discovery doesn't need to be running to connect, but leaving it
            // running slows/blocks the connect() call on many Android
            // Bluetooth stacks — cancel defensively.
            adapter.cancelDiscovery()
            socket.connect()
            socket.outputStream.write(bytes)
            socket.outputStream.flush()
            Result.success(Unit)
        } catch (e: IOException) {
            Result.failure(Exception("Couldn't reach the printer — check it's powered on, in range, and still paired. (${e.message})"))
        } finally {
            try { socket?.close() } catch (e: IOException) { /* best-effort */ }
        }
    }

    /** Bonded (paired) devices — used by MainActivity's picker and by /status
     *  so the web app / support staff can confirm what's available. */
    fun listPairedDevices(): List<BluetoothDevice> {
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        return adapter.bondedDevices?.toList() ?: emptyList()
    }

    private inner class BridgeHttpServer : NanoHTTPD("127.0.0.1", PORT) {

        // Matches print-agent/TengaPOS-PrintAgent.ps1's $AllowedOrigins list —
        // keep these in sync. Chrome enforces CORS on the web app's side, so
        // an unlisted origin gets no Access-Control-Allow-Origin header and
        // the browser blocks the response before JS ever sees it.
        private val allowedOrigins = setOf(
            "https://www.tengapos.co.zw",
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        )

        private fun corsHeaders(session: IHTTPSession, response: Response) {
            val origin = session.headers["origin"]
            if (origin != null && allowedOrigins.contains(origin)) {
                response.addHeader("Access-Control-Allow-Origin", origin)
            }
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            response.addHeader("Access-Control-Allow-Headers", "Content-Type")
            // Chrome's Private Network Access preflight — required because
            // the page is served from a public https origin talking to a
            // loopback address. Same header the Windows agent sends.
            response.addHeader("Access-Control-Allow-Private-Network", "true")
        }

        private fun json(obj: JSONObject, status: Response.Status = Response.Status.OK): Response {
            return newFixedLengthResponse(status, "application/json", obj.toString())
        }

        override fun serve(session: IHTTPSession): Response {
            val response = try {
                when {
                    session.method == Method.OPTIONS ->
                        newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "")

                    session.method == Method.GET && session.uri == "/status" -> {
                        val devices = listPairedDevices()
                        val arr = JSONArray()
                        devices.forEach { d ->
                            arr.put(JSONObject().apply {
                                put("name", d.name ?: "Unknown device")
                                put("address", d.address)
                            })
                        }
                        val selectedMac = prefs.getString(PREF_PRINTER_MAC, null)
                        json(JSONObject().apply {
                            put("ok", true)
                            put("pairedDevices", arr)
                            put("selectedPrinter", selectedMac)
                        })
                    }

                    session.method == Method.POST && session.uri == "/print" -> {
                        val files = HashMap<String, String>()
                        session.parseBody(files)
                        val body = files["postData"] ?: "{}"
                        val payload = JSONObject(body)
                        val bytes = Base64.decode(payload.getString("data"), Base64.DEFAULT)

                        val result = sendToPrinter(bytes)
                        result.fold(
                            onSuccess = { json(JSONObject().apply { put("ok", true) }) },
                            onFailure = { e ->
                                json(
                                    JSONObject().apply {
                                        put("ok", false)
                                        put("error", e.message)
                                    },
                                    Response.Status.INTERNAL_ERROR
                                )
                            }
                        )
                    }

                    // Stub for future hardware sharing the same bridge — a
                    // cash drawer wired into the printer's kick-port opens via
                    // an ESC/POS command sent over this same Bluetooth socket,
                    // no separate device/pairing needed.
                    session.method == Method.POST && session.uri == "/drawer/open" -> {
                        // ESC p 0 25 250 — the near-universal "kick drawer 1"
                        // command most thermal printers forward to their
                        // drawer port unmodified.
                        val kick = byteArrayOf(0x1B, 0x70, 0x00, 0x19, 0xFA.toByte())
                        val result = sendToPrinter(kick)
                        result.fold(
                            onSuccess = { json(JSONObject().apply { put("ok", true) }) },
                            onFailure = { e -> json(JSONObject().apply { put("ok", false); put("error", e.message) }, Response.Status.INTERNAL_ERROR) }
                        )
                    }

                    else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", """{"ok":false,"error":"Not found"}""")
                }
            } catch (e: Exception) {
                json(JSONObject().apply { put("ok", false); put("error", e.message ?: "Unknown error") }, Response.Status.INTERNAL_ERROR)
            }
            corsHeaders(session, response)
            return response
        }
    }
}

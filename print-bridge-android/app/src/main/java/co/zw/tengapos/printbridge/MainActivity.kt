package co.zw.tengapos.printbridge

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var deviceList: ListView
    private lateinit var startButton: Button
    private lateinit var prefs: android.content.SharedPreferences
    private var pairedDevices: List<BluetoothDevice> = emptyList()

    private val requestPermissions = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.values.all { it }) {
            loadPairedDevices()
        } else {
            Toast.makeText(this, "Bluetooth permission is required to select a printer", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = getSharedPreferences(PrintBridgeService.PREFS, MODE_PRIVATE)

        statusText = findViewById(R.id.statusText)
        deviceList = findViewById(R.id.deviceList)
        startButton = findViewById(R.id.startButton)

        startButton.setOnClickListener {
            if (PrintBridgeService.isRunning) {
                stopService(Intent(this, PrintBridgeService::class.java))
            } else {
                val svcIntent = Intent(this, PrintBridgeService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(svcIntent)
                } else {
                    startService(svcIntent)
                }
            }
            // Give the service a moment to flip isRunning before refreshing the label.
            deviceList.postDelayed({ refreshStatus() }, 300)
        }

        deviceList.setOnItemClickListener { _, _, position, _ ->
            val device = pairedDevices[position]
            prefs.edit().putString(PrintBridgeService.PREF_PRINTER_MAC, device.address).apply()
            Toast.makeText(this, "Selected: ${device.name ?: device.address}", Toast.LENGTH_SHORT).show()
            refreshStatus()
        }

        ensurePermissionsThenLoad()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun ensurePermissionsThenLoad() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN)
            }
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (needed.isEmpty()) {
            loadPairedDevices()
        } else {
            requestPermissions.launch(needed.toTypedArray())
        }
    }

    @Suppress("MissingPermission") // permission state checked in ensurePermissionsThenLoad
    private fun loadPairedDevices() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (adapter == null) {
            statusText.text = "This device has no Bluetooth adapter."
            return
        }
        if (!adapter.isEnabled) {
            statusText.text = "Bluetooth is off. Turn it on, then reopen this app."
            return
        }
        pairedDevices = adapter.bondedDevices?.toList() ?: emptyList()
        val labels = pairedDevices.map { "${it.name ?: "Unknown"}  (${it.address})" }
        deviceList.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, labels)
        refreshStatus()
    }

    private fun refreshStatus() {
        val mac = prefs.getString(PrintBridgeService.PREF_PRINTER_MAC, null)
        val selectedName = pairedDevices.find { it.address == mac }?.name ?: mac ?: "none selected"
        val running = PrintBridgeService.isRunning
        statusText.text = buildString {
            append(if (running) "Bridge: RUNNING on port ${PrintBridgeService.PORT}\n" else "Bridge: stopped\n")
            append("Selected printer: $selectedName\n\n")
            append("1. Pair your printer in Android's own Bluetooth settings first (not here).\n")
            append("2. Pick it from the list below.\n")
            append("3. Tap Start — leave this app running in the background while using TengaPOS.")
        }
        startButton.text = if (running) "Stop Bridge" else "Start Bridge"
    }
}

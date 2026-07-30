package co.zw.tengapos.printbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Restarts the bridge automatically after the till reboots, provided it was
 * already configured (a printer had been selected) — so a power cut doesn't
 * silently turn printing off until someone notices and reopens the app.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences(PrintBridgeService.PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(PrintBridgeService.PREF_PRINTER_MAC, null) == null) return

        val svcIntent = Intent(context, PrintBridgeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svcIntent)
        } else {
            context.startService(svcIntent)
        }
    }
}

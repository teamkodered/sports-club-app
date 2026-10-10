package uk.org.derbykickboxing.klasschamp

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Heart rate strap for the web app (window.Capacitor.Plugins.HeartRate):
 *   requestPermissions()            -> { granted }
 *   scan({ seconds })               -> { devices: [{ name, address }] }   straps nearby
 *   start({ address, maxMinutes })  -> background recording (HrRecorderService)
 *   stop({ maxHr })                 -> summary { minutes, avg, max, zones, samples }
 *   status()                        -> { recording, connected, bpm, address, startedAt }
 *   event "hr" { bpm }              live readings while the app is open
 */
@CapacitorPlugin(
  name = "HeartRate",
  permissions = [
    Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]),
    Permission(alias = "location", strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
    Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
  ]
)
class HeartRatePlugin : Plugin() {

  override fun load() {
    HrRecorderService.listener = { bpm -> notifyListeners("hr", JSObject().put("bpm", bpm)) }
    HrRecorderService.finishedListener = { notifyListeners("stopped", JSObject().put("recording", false)) }
  }

  private fun neededAliases(): Array<String> {
    val list = ArrayList<String>()
    if (Build.VERSION.SDK_INT >= 31) list.add("bluetooth") else list.add("location")
    if (Build.VERSION.SDK_INT >= 33) list.add("notifications")
    return list.toTypedArray()
  }

  private fun granted(): Boolean = neededAliases().all { getPermissionState(it) == PermissionState.GRANTED }

  @PluginMethod
  override fun requestPermissions(call: PluginCall) {
    if (granted()) { call.resolve(JSObject().put("granted", true)); return }
    requestPermissionForAliases(neededAliases(), call, "permsDone")
  }

  @PermissionCallback
  private fun permsDone(call: PluginCall) { call.resolve(JSObject().put("granted", granted())) }

  @SuppressLint("MissingPermission")
  @PluginMethod
  fun scan(call: PluginCall) {
    if (!granted()) { call.reject("Bluetooth permission not granted"); return }
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    if (adapter == null || !adapter.isEnabled) { call.reject("Bluetooth is off"); return }
    val scanner = adapter.bluetoothLeScanner ?: run { call.reject("Bluetooth scanner unavailable"); return }
    val found = LinkedHashMap<String, String>()
    val cb = object : ScanCallback() {
      override fun onScanResult(type: Int, r: ScanResult) {
        val name = r.scanRecord?.deviceName ?: try { r.device.name } catch (_: SecurityException) { null } ?: "Heart rate strap"
        found[r.device.address] = name
      }
    }
    val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(HrRecorderService.HR_SERVICE)).build())
    scanner.startScan(filters, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
    Handler(Looper.getMainLooper()).postDelayed({
      try { scanner.stopScan(cb) } catch (_: Exception) {}
      val arr = JSArray()
      for ((addr, name) in found) arr.put(JSObject().put("address", addr).put("name", name))
      call.resolve(JSObject().put("devices", arr))
    }, (call.getInt("seconds") ?: 6) * 1000L)
  }

  @PluginMethod
  fun start(call: PluginCall) {
    val address = call.getString("address") ?: run { call.reject("address is required"); return }
    if (!granted()) { call.reject("Bluetooth permission not granted"); return }
    val i = Intent(context, HrRecorderService::class.java)
      .setAction(HrRecorderService.ACTION_START)
      .putExtra(HrRecorderService.EXTRA_ADDRESS, address)
      .putExtra(HrRecorderService.EXTRA_MAX_MINUTES, call.getInt("maxMinutes") ?: 120)
    if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
    call.resolve(JSObject().put("recording", true))
  }

  @PluginMethod
  fun stop(call: PluginCall) {
    val maxHr = call.getInt("maxHr") ?: 190
    val summary = HrRecorderService.summary(maxHr)   // read before the service clears up
    if (HrRecorderService.recording) {
      context.startService(Intent(context, HrRecorderService::class.java).setAction(HrRecorderService.ACTION_STOP))
    }
    val out = JSObject()
    for ((k, v) in summary) {
      if (v is Map<*, *>) { val z = JSObject(); for ((zk, zv) in v) z.put(zk.toString(), zv); out.put(k, z) } else out.put(k, v)
    }
    call.resolve(out)
  }

  @PluginMethod
  fun status(call: PluginCall) {
    call.resolve(JSObject()
      .put("recording", HrRecorderService.recording)
      .put("connected", HrRecorderService.connected)
      .put("bpm", HrRecorderService.lastBpm)
      .put("address", HrRecorderService.deviceAddress)
      .put("startedAt", HrRecorderService.startedAt))
  }
}

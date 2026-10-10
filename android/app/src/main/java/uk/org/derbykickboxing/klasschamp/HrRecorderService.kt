package uk.org.derbykickboxing.klasschamp

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import java.util.UUID

/**
 * Records heart rate from a Bluetooth strap (Polar H10, Whoop with Heart Rate
 * Broadcast, any standard HR strap) in the background as a foreground service,
 * so it keeps going with the phone locked. Started at class check-in and stopped
 * at check-out by the web app (via HeartRatePlugin); stops itself after maxMinutes.
 */
class HrRecorderService : Service() {

  companion object {
    const val ACTION_START = "kc.hr.START"
    const val ACTION_STOP = "kc.hr.STOP"
    const val EXTRA_ADDRESS = "address"
    const val EXTRA_MAX_MINUTES = "maxMinutes"
    private const val CHANNEL_ID = "kc_hr_recording"
    private const val NOTIF_ID = 4721

    val HR_SERVICE: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
    val HR_MEASUREMENT: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
    val CCC_DESCRIPTOR: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    // shared state read by the plugin
    @Volatile var recording = false
    @Volatile var connected = false
    @Volatile var lastBpm = 0
    @Volatile var startedAt = 0L
    @Volatile var deviceAddress: String? = null
    val samples = ArrayList<Pair<Long, Int>>() // (time ms, bpm)
    var listener: ((Int) -> Unit)? = null
    var finishedListener: (() -> Unit)? = null

    fun summary(maxHr: Int): Map<String, Any> {
      val list = synchronized(samples) { ArrayList(samples) }
      if (list.size < 2) return mapOf("samples" to list.size)
      val minutes = Math.max(1L, (list.last().first - list.first().first) / 60000L)
      val avg = list.sumOf { it.second } / list.size
      val max = list.maxOf { it.second }
      val zones = DoubleArray(6)
      for (i in 1 until list.size) {
        val r = list[i - 1].second.toDouble() / maxHr
        val z = when { r >= 0.9 -> 5; r >= 0.8 -> 4; r >= 0.7 -> 3; r >= 0.6 -> 2; r >= 0.5 -> 1; else -> 0 }
        if (z > 0) zones[z] += (list[i].first - list[i - 1].first) / 1000.0
      }
      val zoneMins = HashMap<String, Long>()
      for (z in 1..5) if (zones[z] > 0) zoneMins["z$z"] = Math.round(zones[z] / 60.0)
      return mapOf("samples" to list.size, "minutes" to minutes, "avg" to avg, "max" to max, "zones" to zoneMins, "maxHr" to maxHr, "startedAt" to list.first().first)
    }
  }

  private var gatt: BluetoothGatt? = null
  private val handler = Handler(Looper.getMainLooper())
  private var lastNotifUpdate = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val address = intent.getStringExtra(EXTRA_ADDRESS) ?: return START_NOT_STICKY
        val maxMinutes = intent.getIntExtra(EXTRA_MAX_MINUTES, 120)
        begin(address, maxMinutes)
      }
      ACTION_STOP -> finish()
    }
    return START_NOT_STICKY
  }

  private fun begin(address: String, maxMinutes: Int) {
    createChannel()
    val notif = buildNotification("Connecting to your heart rate strap…")
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    else startForeground(NOTIF_ID, notif)
    synchronized(samples) { samples.clear() }
    recording = true; connected = false; lastBpm = 0
    startedAt = System.currentTimeMillis(); deviceAddress = address
    connect(address)
    // safety stop if they forget to check out
    handler.postDelayed({ if (recording) finish() }, maxMinutes * 60_000L)
  }

  @SuppressLint("MissingPermission")
  private fun connect(address: String) {
    try {
      val adapter: BluetoothAdapter = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return
      val device = adapter.getRemoteDevice(address)
      // autoConnect = true: reconnects by itself if the strap drops out of range
      gatt = device.connectGatt(this, true, callback, android.bluetooth.BluetoothDevice.TRANSPORT_LE)
    } catch (e: Exception) {
      updateNotification("Could not connect to the strap (${e.message})")
    }
  }

  private val callback = object : BluetoothGattCallback() {
    @SuppressLint("MissingPermission")
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED) { connected = true; g.discoverServices(); updateNotification("Connected — recording heart rate") }
      else if (newState == BluetoothProfile.STATE_DISCONNECTED) { connected = false; if (recording) updateNotification("Strap disconnected — waiting for it to come back…") }
    }

    @SuppressLint("MissingPermission")
    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      val ch = g.getService(HR_SERVICE)?.getCharacteristic(HR_MEASUREMENT) ?: return
      g.setCharacteristicNotification(ch, true)
      val d = ch.getDescriptor(CCC_DESCRIPTOR) ?: return
      if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
      else { @Suppress("DEPRECATION") run { d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE; g.writeDescriptor(d) } }
    }

    // Android 13+
    override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) { handle(value) }
    // Android 12 and below
    @Deprecated("Deprecated in Java")
    override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
      @Suppress("DEPRECATION") ch.value?.let { handle(it) }
    }
  }

  private fun handle(v: ByteArray) {
    if (v.size < 2) return
    val flags = v[0].toInt()
    val bpm = if (flags and 0x01 != 0 && v.size >= 3) ((v[2].toInt() and 0xFF) shl 8) or (v[1].toInt() and 0xFF) else (v[1].toInt() and 0xFF)
    if (bpm <= 0) return
    lastBpm = bpm
    if (recording) synchronized(samples) { samples.add(Pair(System.currentTimeMillis(), bpm)) }
    listener?.invoke(bpm)
    val now = System.currentTimeMillis()
    if (now - lastNotifUpdate > 5000) {
      lastNotifUpdate = now
      val mins = (now - startedAt) / 60000
      updateNotification("❤️ $bpm bpm · recording ${mins} min")
    }
  }

  @SuppressLint("MissingPermission")
  private fun finish() {
    recording = false
    handler.removeCallbacksAndMessages(null)
    try { gatt?.disconnect(); gatt?.close() } catch (_: Exception) {}
    gatt = null; connected = false
    finishedListener?.invoke()
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) == null)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Heart rate recording", NotificationManager.IMPORTANCE_LOW))
    }
  }

  private fun buildNotification(text: String): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Klass Champ — class session")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi)
      .build()
  }

  private fun updateNotification(text: String) {
    try { getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(text)) } catch (_: Exception) {}
  }

  override fun onDestroy() { recording = false; try { gatt?.close() } catch (_: Exception) {}; super.onDestroy() }
}

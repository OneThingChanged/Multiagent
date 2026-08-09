package com.onethingchanged.multiagent.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.min

class MultiAgentMonitorService : Service() {
  private val executor = Executors.newSingleThreadExecutor()
  @Volatile private var running = false
  private lateinit var storage: MonitorStorage
  private lateinit var notifications: NotificationManager

  override fun onCreate() {
    super.onCreate()
    storage = MonitorStorage(this)
    notifications = getSystemService(NotificationManager::class.java)
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP || storage.load() == null) {
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    startForeground(MONITOR_NOTIFICATION_ID, monitorNotification("Remote 연결 준비 중"))
    if (!running) {
      running = true
      executor.execute(::monitorLoop)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    executor.shutdownNow()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun monitorLoop() {
    var failures = 0
    while (running && !Thread.currentThread().isInterrupted) {
      val config = storage.load() ?: break
      try {
        val result = poll(config)
        failures = 0
        val events = result.optJSONArray("events")
        if (events != null) {
          for (index in 0 until events.length()) showAgentNotification(events.getJSONObject(index))
        }
        val cursor = result.optLong("cursor", config.cursor)
        storage.updateCursor(cursor)
        notifications.notify(MONITOR_NOTIFICATION_ID, monitorNotification("Remote 연결됨"))
      } catch (error: UnauthorizedDevice) {
        storage.clear()
        showAuthenticationExpired()
        break
      } catch (_: Throwable) {
        failures += 1
        notifications.notify(MONITOR_NOTIFICATION_ID, monitorNotification("연결 재시도 중"))
        try {
          TimeUnit.SECONDS.sleep(min(30, 1 shl min(failures, 5)).toLong())
        } catch (_: InterruptedException) {
          break
        }
      }
    }
    running = false
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun poll(config: MonitorConfig): JSONObject {
    val url = URL("${config.baseUrl}/api/monitor/device?cursor=${config.cursor}")
    val connection = url.openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "GET"
      connection.connectTimeout = 10_000
      connection.readTimeout = 35_000
      connection.useCaches = false
      connection.setRequestProperty("Accept", "application/json")
      connection.setRequestProperty("Authorization", "Bearer ${config.token}")
      val status = connection.responseCode
      if (status == 401 || status == 403) throw UnauthorizedDevice()
      if (status !in 200..299) throw IllegalStateException("Remote HTTP $status")
      return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
    } finally {
      connection.disconnect()
    }
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notifications.createNotificationChannel(NotificationChannel(
      MONITOR_CHANNEL,
      "MultiAgent 백그라운드 모니터링",
      NotificationManager.IMPORTANCE_LOW,
    ).apply { description = "Remote 작업 상태 연결을 유지합니다." })
    notifications.createNotificationChannel(NotificationChannel(
      EVENT_CHANNEL,
      "에이전트 작업 알림",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply { description = "완료 및 응답 필요 상태를 알립니다." })
  }

  private fun launchIntent(agentId: String? = null): PendingIntent {
    val intent = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      if (!agentId.isNullOrBlank()) data = Uri.parse("multiagent://open?agent=${Uri.encode(agentId)}")
    }
    return PendingIntent.getActivity(
      this,
      agentId?.hashCode() ?: 0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun monitorNotification(state: String) = NotificationCompat.Builder(this, MONITOR_CHANNEL)
    .setSmallIcon(R.drawable.multiagent_notification_icon)
    .setContentTitle("MultiAgent 모니터링 중")
    .setContentText(state)
    .setContentIntent(launchIntent())
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .build()

  private fun showAgentNotification(event: JSONObject) {
    val agentId = event.optString("agentId")
    if (!Regex("^[A-Za-z0-9._:-]{1,128}$").matches(agentId)) return
    val type = event.optString("type")
    val title = event.optString("title", "MultiAgent").take(120)
    val body = if (type == "agent-question") "응답이 필요합니다." else "작업이 완료되었습니다."
    notifications.notify(
      "${type}:${agentId}".hashCode(),
      NotificationCompat.Builder(this, EVENT_CHANNEL)
        .setSmallIcon(R.drawable.multiagent_notification_icon)
        .setContentTitle(title)
        .setContentText(body)
        .setContentIntent(launchIntent(agentId))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .build(),
    )
  }

  private fun showAuthenticationExpired() {
    notifications.notify(
      AUTH_NOTIFICATION_ID,
      NotificationCompat.Builder(this, EVENT_CHANNEL)
        .setSmallIcon(R.drawable.multiagent_notification_icon)
        .setContentTitle("MultiAgent 모니터링이 중지되었습니다")
        .setContentText("앱에서 알림을 다시 켜 주세요.")
        .setContentIntent(launchIntent())
        .setAutoCancel(true)
        .build(),
    )
  }

  private class UnauthorizedDevice : Exception()

  companion object {
    const val ACTION_START = "com.onethingchanged.multiagent.mobile.START_MONITOR"
    const val ACTION_STOP = "com.onethingchanged.multiagent.mobile.STOP_MONITOR"
    private const val MONITOR_CHANNEL = "multiagent-monitor"
    private const val EVENT_CHANNEL = "multiagent-agent-events"
    private const val MONITOR_NOTIFICATION_ID = 42001
    private const val AUTH_NOTIFICATION_ID = 42002
  }
}

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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import kotlin.math.min

class MultiAgentMonitorService : Service() {
  private val executor = Executors.newCachedThreadPool()
  private val jobs = ConcurrentHashMap<String, Future<*>>()
  private val connected = ConcurrentHashMap.newKeySet<String>()
  @Volatile private var shuttingDown = false
  private lateinit var storage: MonitorStorage
  private lateinit var notifications: NotificationManager

  override fun onCreate() {
    super.onCreate()
    storage = MonitorStorage(this)
    notifications = getSystemService(NotificationManager::class.java)
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val configs = storage.loadAll()
    if (configs.isEmpty()) {
      stopMonitorService()
      return START_NOT_STICKY
    }
    startForeground(MONITOR_NOTIFICATION_ID, monitorNotification("${configs.size}대 Remote 연결 준비 중"))
    syncWorkers(configs)
    return START_STICKY
  }

  override fun onDestroy() {
    shuttingDown = true
    jobs.values.forEach { it.cancel(true) }
    jobs.clear()
    connected.clear()
    executor.shutdownNow()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  @Synchronized
  private fun syncWorkers(configs: List<MonitorConfig> = storage.loadAll()) {
    val requested = configs.associateBy(::profileKey)
    for ((key, job) in jobs.entries) {
      if (key !in requested) {
        job.cancel(true)
        jobs.remove(key, job)
        connected.remove(key)
      }
    }
    for ((key, config) in requested) {
      if (jobs[key]?.isDone == false) continue
      val task = FutureTask {
        try {
          monitorProfile(key, config)
        } finally {
          jobs.remove(key)
          connected.remove(key)
          val remaining = storage.loadAll()
          if (remaining.isEmpty()) stopMonitorService() else updateMonitorNotification(remaining)
        }
      }
      val previous = jobs.putIfAbsent(key, task)
      if (previous == null) executor.execute(task)
    }
    updateMonitorNotification(configs)
  }

  private fun monitorProfile(key: String, initial: MonitorConfig) {
    var failures = 0
    var fallback = initial
    while (!shuttingDown && !Thread.currentThread().isInterrupted) {
      val config = storage.loadAll().find { profileKey(it) == key } ?: break
      fallback = config
      try {
        val result = poll(config)
        failures = 0
        connected.add(key)
        val events = result.optJSONArray("events")
        if (events != null) {
          for (index in 0 until events.length()) showAgentNotification(config, events.getJSONObject(index))
        }
        val cursor = result.optLong("cursor", config.cursor)
        storage.updateCursor(config, cursor)
        updateMonitorNotification()
      } catch (_: UnauthorizedDevice) {
        storage.removeConfig(config)
        showAuthenticationExpired(config)
        break
      } catch (_: Throwable) {
        connected.remove(key)
        failures += 1
        updateMonitorNotification()
        try {
          TimeUnit.SECONDS.sleep(min(30, 1 shl min(failures, 5)).toLong())
        } catch (_: InterruptedException) {
          break
        }
      }
    }
    connected.remove(profileKey(fallback))
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

  private fun profileKey(config: MonitorConfig) = config.profileId.ifBlank { "legacy:${config.baseUrl}" }

  private fun updateMonitorNotification(configs: List<MonitorConfig> = storage.loadAll()) {
    if (configs.isEmpty()) return
    val connectedCount = configs.count { profileKey(it) in connected }
    val state = when {
      connectedCount == configs.size -> "${configs.size}대 Remote 연결됨"
      connectedCount > 0 -> "$connectedCount/${configs.size}대 연결됨"
      else -> "${configs.size}대 Remote 연결 재시도 중"
    }
    notifications.notify(MONITOR_NOTIFICATION_ID, monitorNotification(state))
  }

  private fun stopMonitorService() {
    shuttingDown = true
    jobs.values.forEach { it.cancel(true) }
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notifications.createNotificationChannel(NotificationChannel(
      MONITOR_CHANNEL,
      "Acedia 백그라운드 모니터링",
      NotificationManager.IMPORTANCE_LOW,
    ).apply { description = "여러 Remote 작업 상태 연결을 유지합니다." })
    notifications.createNotificationChannel(NotificationChannel(
      EVENT_CHANNEL,
      "에이전트 작업 알림",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply { description = "완료 및 응답 필요 상태를 알립니다." })
  }

  private fun launchIntent(config: MonitorConfig? = null, agentId: String? = null): PendingIntent {
    val intent = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      if (!agentId.isNullOrBlank()) {
        data = Uri.parse("multiagent://open").buildUpon()
          .apply {
            if (!config?.profileId.isNullOrBlank()) appendQueryParameter("profile", config?.profileId)
            appendQueryParameter("agent", agentId)
          }
          .build()
      }
    }
    val requestKey = "${config?.profileId}:${agentId}".hashCode()
    return PendingIntent.getActivity(
      this,
      requestKey,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun monitorNotification(state: String) = NotificationCompat.Builder(this, MONITOR_CHANNEL)
    .setSmallIcon(R.drawable.multiagent_notification_icon)
    .setContentTitle("Acedia 모니터링 중")
    .setContentText(state)
    .setContentIntent(launchIntent())
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .build()

  private fun showAgentNotification(config: MonitorConfig, event: JSONObject) {
    val agentId = event.optString("agentId")
    if (!Regex("^[A-Za-z0-9._:-]{1,128}$").matches(agentId)) return
    val type = event.optString("type")
    val title = event.optString("title", "Acedia").take(120)
    val body = if (type == "agent-question") "응답이 필요합니다." else "작업이 완료되었습니다."
    notifications.notify(
      "${config.profileId}:${type}:${agentId}".hashCode(),
      NotificationCompat.Builder(this, EVENT_CHANNEL)
        .setSmallIcon(R.drawable.multiagent_notification_icon)
        .setContentTitle("${config.profileName} · $title")
        .setContentText(body)
        .setContentIntent(launchIntent(config, agentId))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .build(),
    )
  }

  private fun showAuthenticationExpired(config: MonitorConfig) {
    notifications.notify(
      "auth:${config.profileId}:${config.baseUrl}".hashCode(),
      NotificationCompat.Builder(this, EVENT_CHANNEL)
        .setSmallIcon(R.drawable.multiagent_notification_icon)
        .setContentTitle("${config.profileName} 모니터링 중지")
        .setContentText("해당 PC에서 알림을 다시 켜 주세요.")
        .setContentIntent(launchIntent(config))
        .setAutoCancel(true)
        .build(),
    )
  }

  private class UnauthorizedDevice : Exception()

  companion object {
    const val ACTION_SYNC = "com.onethingchanged.multiagent.mobile.SYNC_MONITORS"
    private const val MONITOR_CHANNEL = "multiagent-monitor"
    private const val EVENT_CHANNEL = "multiagent-agent-events"
    private const val MONITOR_NOTIFICATION_ID = 42001
  }
}

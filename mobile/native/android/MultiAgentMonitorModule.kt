package com.onethingchanged.multiagent.mobile

import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MultiAgentMonitorModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val storage = MonitorStorage(context)

  override fun getName() = "MultiAgentMonitor"

  @ReactMethod
  fun startMonitoring(baseUrlValue: String, token: String, cursorValue: Double, promise: Promise) {
    var pending: MonitorConfig? = null
    try {
      val baseUrl = validateBaseUrl(baseUrlValue)
      if (!MonitorStorage.TOKEN_PATTERN.matches(token)) throw IllegalArgumentException("잘못된 기기 토큰입니다.")
      val previous = storage.load()
      pending = MonitorConfig(baseUrl, token, cursorValue.toLong().coerceAtLeast(0L))
      storage.save(pending)
      if (previous != null && previous.token != token) executor.execute { revoke(previous) }
      ContextCompat.startForegroundService(
        context,
        Intent(context, MultiAgentMonitorService::class.java).setAction(MultiAgentMonitorService.ACTION_START),
      )
      promise.resolve(Arguments.createMap().apply { putBoolean("active", true) })
    } catch (error: Throwable) {
      storage.clear()
      pending?.let { executor.execute { revoke(it) } }
      promise.reject("MONITOR_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopMonitoring(revokeToken: Boolean, promise: Promise) {
    val previous = storage.load()
    storage.clear()
    context.stopService(Intent(context, MultiAgentMonitorService::class.java))
    if (revokeToken && previous != null) executor.execute { revoke(previous) }
    promise.resolve(Arguments.createMap().apply { putBoolean("active", false) })
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(Arguments.createMap().apply { putBoolean("active", storage.load() != null) })
  }

  private fun validateBaseUrl(value: String): String {
    val uri = Uri.parse(value.trim())
    val scheme = uri.scheme?.lowercase()
    val host = uri.host?.lowercase()
    val secure = scheme == "https"
    val localHttp = scheme == "http" && isLocalHost(host)
    if ((!secure && !localHttp) || host.isNullOrBlank()) {
      throw IllegalArgumentException("공개 Remote 백그라운드 모니터링에는 HTTPS 주소가 필요합니다.")
    }
    return value.trim().trimEnd('/')
  }

  private fun isLocalHost(host: String?): Boolean {
    if (host == "127.0.0.1" || host == "localhost" || host == "::1") return true
    val parts = host?.split('.')?.mapNotNull { it.toIntOrNull() } ?: return false
    if (parts.size != 4 || parts.any { it !in 0..255 }) return false
    return parts[0] == 10 ||
      (parts[0] == 172 && parts[1] in 16..31) ||
      (parts[0] == 192 && parts[1] == 168)
  }

  private fun revoke(config: MonitorConfig) {
    try {
      val connection = URL("${config.baseUrl}/api/monitor/device").openConnection() as HttpURLConnection
      connection.requestMethod = "DELETE"
      connection.connectTimeout = 10_000
      connection.readTimeout = 10_000
      connection.setRequestProperty("Authorization", "Bearer ${config.token}")
      connection.inputStream.use { it.readBytes() }
      connection.disconnect()
    } catch (_: Throwable) {}
  }
}

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
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class MultiAgentMonitorModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newCachedThreadPool()
  private val storage = MonitorStorage(context)
  private val sessionStorage = MobileSessionStorage(context)

  override fun getName() = "MultiAgentMonitor"

  @ReactMethod
  fun startMonitoring(
    profileIdValue: String,
    profileNameValue: String,
    baseUrlValue: String,
    token: String,
    cursorValue: Double,
    promise: Promise,
  ) {
    var pending: MonitorConfig? = null
    try {
      val profileId = profileIdValue.trim()
      if (!MonitorStorage.PROFILE_ID_PATTERN.matches(profileId)) {
        throw IllegalArgumentException("잘못된 PC 프로필입니다.")
      }
      val baseUrl = validateBaseUrl(baseUrlValue)
      val profileName = profileNameValue.trim().take(60).ifBlank { Uri.parse(baseUrl).host ?: "Acedia PC" }
      if (!MonitorStorage.TOKEN_PATTERN.matches(token)) throw IllegalArgumentException("잘못된 기기 토큰입니다.")
      val previous = storage.loadAll().find {
        it.profileId == profileId || it.baseUrl.equals(baseUrl, ignoreCase = true)
      }
      pending = MonitorConfig(profileId, profileName, baseUrl, token, cursorValue.toLong().coerceAtLeast(0L))
      storage.upsert(pending)
      if (previous != null && previous.token != token) executor.execute { revoke(previous) }
      ContextCompat.startForegroundService(
        context,
        Intent(context, MultiAgentMonitorService::class.java).setAction(MultiAgentMonitorService.ACTION_SYNC),
      )
      val count = storage.loadAll().size
      promise.resolve(Arguments.createMap().apply {
        putBoolean("active", true)
        putInt("count", count)
      })
    } catch (error: Throwable) {
      pending?.let {
        storage.removeConfig(it)
        executor.execute { revoke(it) }
      }
      promise.reject("MONITOR_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopMonitoring(profileIdValue: String, baseUrlValue: String, revokeToken: Boolean, promise: Promise) {
    val profileId = profileIdValue.trim()
    val baseUrl = baseUrlValue.trim().trimEnd('/')
    val previous = storage.remove(profileId, baseUrl)
    val remaining = storage.loadAll().size
    if (remaining == 0) {
      context.stopService(Intent(context, MultiAgentMonitorService::class.java))
    } else {
      ContextCompat.startForegroundService(
        context,
        Intent(context, MultiAgentMonitorService::class.java).setAction(MultiAgentMonitorService.ACTION_SYNC),
      )
    }
    if (revokeToken && previous != null) executor.execute { revoke(previous) }
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", false)
      putInt("count", remaining)
    })
  }

  @ReactMethod
  fun getStatus(profileIdValue: String, baseUrlValue: String, promise: Promise) {
    val profileId = profileIdValue.trim()
    val baseUrl = baseUrlValue.trim().trimEnd('/')
    val configs = storage.loadAll()
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", configs.any {
        it.profileId == profileId || it.baseUrl.equals(baseUrl, ignoreCase = true)
      })
      putInt("count", configs.size)
    })
  }

  @ReactMethod
  fun registerSessionAccess(
    profileIdValue: String,
    profileNameValue: String,
    baseUrlValue: String,
    token: String,
    promise: Promise,
  ) {
    try {
      val profileId = profileIdValue.trim()
      if (!MonitorStorage.PROFILE_ID_PATTERN.matches(profileId)) {
        throw IllegalArgumentException("잘못된 PC 프로필입니다.")
      }
      val baseUrl = validateBaseUrl(baseUrlValue)
      val profileName = profileNameValue.trim().take(60)
        .ifBlank { Uri.parse(baseUrl).host ?: "Acedia PC" }
      if (!MonitorStorage.TOKEN_PATTERN.matches(token)) {
        throw IllegalArgumentException("잘못된 모바일 조회 토큰입니다.")
      }
      val previous = sessionStorage.loadAll().find {
        it.profileId == profileId || it.baseUrl.equals(baseUrl, ignoreCase = true)
      }
      sessionStorage.upsert(MobileSessionAccess(profileId, profileName, baseUrl, token))
      if (previous != null && previous.token != token) {
        executor.execute { revokeSessionAccess(previous) }
      }
      promise.resolve(Arguments.createMap().apply { putBoolean("active", true) })
    } catch (error: Throwable) {
      promise.reject("SESSION_ACCESS_REGISTER_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun removeSessionAccess(
    profileIdValue: String,
    baseUrlValue: String,
    revokeToken: Boolean,
    promise: Promise,
  ) {
    val removed = sessionStorage.remove(profileIdValue.trim(), baseUrlValue.trim().trimEnd('/'))
    if (revokeToken && removed != null) executor.execute { revokeSessionAccess(removed) }
    promise.resolve(Arguments.createMap().apply { putBoolean("active", false) })
  }

  @ReactMethod
  fun getSessionAccessStatus(profileIdValue: String, baseUrlValue: String, promise: Promise) {
    val profileId = profileIdValue.trim()
    val baseUrl = baseUrlValue.trim().trimEnd('/')
    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", sessionStorage.loadAll().any {
        it.profileId == profileId || it.baseUrl.equals(baseUrl, ignoreCase = true)
      })
    })
  }

  @ReactMethod
  fun listSessionSnapshots(promise: Promise) {
    executor.execute {
      try {
        val futures = sessionStorage.loadAll().map { access ->
          executor.submit(Callable { fetchSessionSnapshot(access) })
        }
        val results = Arguments.createArray()
        futures.forEach { results.pushMap(it.get()) }
        promise.resolve(results)
      } catch (error: Throwable) {
        promise.reject("SESSION_SNAPSHOT_FAILED", error.message, error)
      }
    }
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

  private fun fetchSessionSnapshot(access: MobileSessionAccess) = Arguments.createMap().apply {
    putString("profileId", access.profileId)
    putString("baseUrl", access.baseUrl)
    var connection: HttpURLConnection? = null
    try {
      connection = URL("${access.baseUrl}/api/mobile/sessions").openConnection() as HttpURLConnection
      connection.requestMethod = "GET"
      connection.connectTimeout = 8_000
      connection.readTimeout = 8_000
      connection.setRequestProperty("Authorization", "Bearer ${access.token}")
      connection.setRequestProperty("Accept", "application/json")
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }?.take(512_000).orEmpty()
      putInt("statusCode", status)
      if (status == 200) {
        putBoolean("ok", true)
        putString("body", body)
      } else {
        putBoolean("ok", false)
        putBoolean("authRequired", status == 401 || status == 403)
        putString("error", if (status == 401) "로그인이 필요합니다." else "서버 응답 오류 ($status)")
        if (status == 401) sessionStorage.remove(access.profileId, access.baseUrl)
      }
    } catch (error: Throwable) {
      putBoolean("ok", false)
      putBoolean("authRequired", false)
      putString("error", error.message ?: "서버에 연결하지 못했습니다.")
    } finally {
      connection?.disconnect()
    }
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

  private fun revokeSessionAccess(access: MobileSessionAccess) {
    try {
      val connection = URL("${access.baseUrl}/api/mobile/device").openConnection() as HttpURLConnection
      connection.requestMethod = "DELETE"
      connection.connectTimeout = 10_000
      connection.readTimeout = 10_000
      connection.setRequestProperty("Authorization", "Bearer ${access.token}")
      val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
      stream?.use { it.readBytes() }
      connection.disconnect()
    } catch (_: Throwable) {}
  }
}

package com.onethingchanged.multiagent.mobile

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class MonitorConfig(
  val profileId: String,
  val profileName: String,
  val baseUrl: String,
  val token: String,
  val cursor: Long,
)

class MonitorStorage(private val context: Context) {
  private val preferences = context.getSharedPreferences("multiagent_monitor", Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build(),
    )
    return generator.generateKey()
  }

  private fun toJson(config: MonitorConfig) = JSONObject()
    .put("profileId", config.profileId)
    .put("profileName", config.profileName)
    .put("baseUrl", config.baseUrl)
    .put("token", config.token)
    .put("cursor", config.cursor)

  private fun fromJson(json: JSONObject): MonitorConfig? {
    val baseUrl = json.optString("baseUrl").trimEnd('/')
    val token = json.optString("token")
    val storedProfileId = json.optString("profileId")
    val profileId = storedProfileId.ifBlank { profileIdForUrl("${baseUrl.trimEnd('/')}/") }
    if (baseUrl.isBlank() || !TOKEN_PATTERN.matches(token)) return null
    if (profileId.isNotBlank() && !PROFILE_ID_PATTERN.matches(profileId)) return null
    val fallbackName = Uri.parse(baseUrl).host ?: "MultiAgent PC"
    val profileName = json.optString("profileName", fallbackName).trim().take(60).ifBlank { fallbackName }
    return MonitorConfig(profileId, profileName, baseUrl, token, json.optLong("cursor", 0L).coerceAtLeast(0L))
  }

  @Synchronized
  private fun saveAll(configs: List<MonitorConfig>) {
    if (configs.isEmpty()) {
      clear()
      return
    }
    val payload = JSONArray().apply { configs.forEach { put(toJson(it)) } }
      .toString()
      .toByteArray(Charsets.UTF_8)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val encrypted = cipher.doFinal(payload)
    preferences.edit()
      .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .putString("payload", Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .apply()
  }

  @Synchronized
  fun loadAll(): List<MonitorConfig> {
    return try {
      val iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)
      val payload = Base64.decode(preferences.getString("payload", ""), Base64.NO_WRAP)
      if (iv.isEmpty() || payload.isEmpty()) return emptyList()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      val decoded = String(cipher.doFinal(payload), Charsets.UTF_8).trim()
      val rows = if (decoded.startsWith("[")) {
        val array = JSONArray(decoded)
        (0 until array.length()).mapNotNull { fromJson(array.getJSONObject(it)) }
      } else {
        listOfNotNull(fromJson(JSONObject(decoded)))
      }
      rows.distinctBy { if (it.profileId.isNotBlank()) it.profileId else it.baseUrl }
    } catch (_: Throwable) {
      clear()
      emptyList()
    }
  }

  @Synchronized
  fun load(profileId: String): MonitorConfig? = loadAll().find { it.profileId == profileId }

  @Synchronized
  fun upsert(config: MonitorConfig) {
    val next = loadAll().filterNot {
      it.profileId == config.profileId || it.baseUrl.equals(config.baseUrl, ignoreCase = true)
    } + config
    saveAll(next)
  }

  @Synchronized
  fun remove(profileId: String, baseUrl: String): MonitorConfig? {
    val current = loadAll()
    val removed = current.find {
      it.profileId == profileId || it.baseUrl.equals(baseUrl.trimEnd('/'), ignoreCase = true)
    } ?: return null
    saveAll(current.filterNot { it.token == removed.token })
    return removed
  }

  @Synchronized
  fun removeConfig(config: MonitorConfig) {
    saveAll(loadAll().filterNot {
      (config.profileId.isNotBlank() && it.profileId == config.profileId) || it.token == config.token
    })
  }

  @Synchronized
  fun updateCursor(config: MonitorConfig, cursor: Long) {
    val current = loadAll()
    var changed = false
    val next = current.map {
      if (it.token == config.token && cursor > it.cursor) {
        changed = true
        it.copy(cursor = cursor)
      } else it
    }
    if (changed) saveAll(next)
  }

  @Synchronized
  fun clear() {
    preferences.edit().clear().apply()
  }

  companion object {
    private const val KEY_ALIAS = "multiagent_monitor_token_v1"
    val TOKEN_PATTERN = Regex("^ma1_[A-Za-z0-9_-]{43}$")
    val PROFILE_ID_PATTERN = Regex("^[A-Za-z0-9._:-]{1,128}$")

    private fun profileIdForUrl(baseUrl: String): String {
      var hash = 0x811c9dc5.toInt()
      for (character in baseUrl) {
        hash = hash xor character.code
        hash *= 0x01000193
      }
      return "pc-${hash.toUInt().toString(36)}"
    }
  }
}

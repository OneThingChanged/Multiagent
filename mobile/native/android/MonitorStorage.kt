package com.onethingchanged.multiagent.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class MonitorConfig(
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

  @Synchronized
  fun save(config: MonitorConfig) {
    val payload = JSONObject()
      .put("baseUrl", config.baseUrl)
      .put("token", config.token)
      .put("cursor", config.cursor)
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
  fun load(): MonitorConfig? {
    return try {
      val iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)
      val payload = Base64.decode(preferences.getString("payload", ""), Base64.NO_WRAP)
      if (iv.isEmpty() || payload.isEmpty()) return null
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      val json = JSONObject(String(cipher.doFinal(payload), Charsets.UTF_8))
      val baseUrl = json.optString("baseUrl").trimEnd('/')
      val token = json.optString("token")
      if (baseUrl.isBlank() || !TOKEN_PATTERN.matches(token)) return null
      MonitorConfig(baseUrl, token, json.optLong("cursor", 0L).coerceAtLeast(0L))
    } catch (_: Throwable) {
      clear()
      null
    }
  }

  @Synchronized
  fun updateCursor(cursor: Long) {
    val current = load() ?: return
    if (cursor > current.cursor) save(current.copy(cursor = cursor))
  }

  @Synchronized
  fun clear() {
    preferences.edit().clear().apply()
  }

  companion object {
    private const val KEY_ALIAS = "multiagent_monitor_token_v1"
    val TOKEN_PATTERN = Regex("^ma1_[A-Za-z0-9_-]{43}$")
  }
}

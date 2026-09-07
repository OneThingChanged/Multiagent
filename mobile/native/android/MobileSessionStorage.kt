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

data class MobileSessionAccess(
  val profileId: String,
  val profileName: String,
  val baseUrl: String,
  val token: String,
)

class MobileSessionStorage(private val context: Context) {
  private val preferences = context.getSharedPreferences("multiagent_mobile_sessions", Context.MODE_PRIVATE)

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

  private fun toJson(access: MobileSessionAccess) = JSONObject()
    .put("profileId", access.profileId)
    .put("profileName", access.profileName)
    .put("baseUrl", access.baseUrl)
    .put("token", access.token)

  private fun fromJson(json: JSONObject): MobileSessionAccess? {
    val profileId = json.optString("profileId").trim()
    val baseUrl = json.optString("baseUrl").trim().trimEnd('/')
    val token = json.optString("token")
    if (!MonitorStorage.PROFILE_ID_PATTERN.matches(profileId)) return null
    if (!MonitorStorage.TOKEN_PATTERN.matches(token) || baseUrl.isBlank()) return null
    val fallbackName = Uri.parse(baseUrl).host ?: "Acedia PC"
    val profileName = json.optString("profileName", fallbackName)
      .trim()
      .take(60)
      .ifBlank { fallbackName }
    return MobileSessionAccess(profileId, profileName, baseUrl, token)
  }

  @Synchronized
  private fun saveAll(accesses: List<MobileSessionAccess>) {
    if (accesses.isEmpty()) {
      clear()
      return
    }
    val payload = JSONArray().apply { accesses.forEach { put(toJson(it)) } }
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
  fun loadAll(): List<MobileSessionAccess> {
    return try {
      val iv = Base64.decode(preferences.getString("iv", ""), Base64.NO_WRAP)
      val payload = Base64.decode(preferences.getString("payload", ""), Base64.NO_WRAP)
      if (iv.isEmpty() || payload.isEmpty()) return emptyList()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      val array = JSONArray(String(cipher.doFinal(payload), Charsets.UTF_8))
      (0 until array.length())
        .mapNotNull { fromJson(array.getJSONObject(it)) }
        .distinctBy { it.profileId }
    } catch (_: Throwable) {
      clear()
      emptyList()
    }
  }

  @Synchronized
  fun upsert(access: MobileSessionAccess) {
    saveAll(loadAll().filterNot {
      it.profileId == access.profileId || it.baseUrl.equals(access.baseUrl, ignoreCase = true)
    } + access)
  }

  @Synchronized
  fun remove(profileId: String, baseUrl: String): MobileSessionAccess? {
    val current = loadAll()
    val removed = current.find {
      it.profileId == profileId || it.baseUrl.equals(baseUrl.trimEnd('/'), ignoreCase = true)
    } ?: return null
    saveAll(current.filterNot { it.token == removed.token })
    return removed
  }

  @Synchronized
  fun clear() {
    preferences.edit().clear().apply()
  }

  companion object {
    private const val KEY_ALIAS = "multiagent_mobile_sessions_v1"
  }
}

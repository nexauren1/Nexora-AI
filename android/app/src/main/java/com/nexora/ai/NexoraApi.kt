package com.nexora.ai

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class NexoraApi(private val deviceId: String) {
    companion object {
        private const val BASE_URL = "https://red-dawn-ded1.workers.dev"
    }

    fun usage(): JSONObject = requestJson("GET", "/api/usage", null)

    fun chat(
        message: String,
        mode: String,
        conversationId: String,
        history: List<ChatMessage>,
        fileName: String?,
        mimeType: String?,
        fileBytes: ByteArray?
    ): JSONObject {
        val body = JSONObject()
            .put("message", message)
            .put("mode", mode)
            .put("conversationId", conversationId)

        val items = JSONArray()
        history.takeLast(12).forEach {
            items.put(
                JSONObject()
                    .put("role", if (it.user) "user" else "assistant")
                    .put("content", it.text)
            )
        }
        body.put("history", items.toString())

        if (fileBytes != null) {
            body.put("fileName", fileName ?: "file")
            body.put("mimeType", mimeType ?: "application/octet-stream")
            body.put("fileBytes", Base64.encodeToString(fileBytes, Base64.NO_WRAP))
        }

        return requestJson("POST", "/api/chat", body)
    }

    fun image(prompt: String): JSONObject =
        requestJson("POST", "/api/image", JSONObject().put("prompt", prompt))

    fun tts(text: String): ByteArray =
        requestBytes(
            "POST",
            "/api/tts",
            JSONObject().put("text", text.take(7000)).put("voice", "Kore")
        )

    private fun requestJson(method: String, path: String, body: JSONObject?): JSONObject {
        val response = request(
            method,
            path,
            body?.toString()?.toByteArray(StandardCharsets.UTF_8)
        )
        val json = JSONObject(response.text)
        if (response.code >= 400) {
            throw Exception(json.optString("error", "Erro do servidor."))
        }
        return json
    }

    private fun requestBytes(method: String, path: String, body: JSONObject): ByteArray {
        val response = request(method, path, body.toString().toByteArray(StandardCharsets.UTF_8))
        if (response.code >= 400) {
            val error = runCatching { JSONObject(response.text).optString("error") }.getOrNull()
            throw Exception(error?.takeIf { it.isNotEmpty() } ?: "Erro do servidor.")
        }
        return response.bytes
    }

    private fun request(method: String, path: String, body: ByteArray?): Response {
        val connection = URL(BASE_URL + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 20_000
        connection.readTimeout = 120_000
        connection.setRequestProperty("accept", "application/json")
        connection.setRequestProperty("x-nexora-device", deviceId)

        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("content-type", "application/json; charset=UTF-8")
            connection.outputStream.use { it.write(body) }
        }

        val code = connection.responseCode
        val input = if (code >= 400) connection.errorStream else connection.inputStream
        val bytes = readAll(input)
        connection.disconnect()
        return Response(code, bytes)
    }

    private fun readAll(input: InputStream?): ByteArray {
        if (input == null) return ByteArray(0)
        val output = ByteArrayOutputStream()
        input.use {
            val buffer = ByteArray(8192)
            while (true) {
                val count = it.read(buffer)
                if (count < 0) break
                output.write(buffer, 0, count)
            }
        }
        return output.toByteArray()
    }

    private data class Response(val code: Int, val bytes: ByteArray) {
        val text: String
            get() = bytes.toString(StandardCharsets.UTF_8)
    }
}

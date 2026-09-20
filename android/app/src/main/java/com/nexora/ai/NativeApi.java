package com.nexora.ai;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

public final class NativeApi {
    public static final String BASE_URL =
        "https://red-dawn-ded1.workers.dev";

    private final String deviceId;

    public NativeApi(String deviceId) {
        this.deviceId = deviceId;
    }

    public JSONObject usage()
        throws Exception {
        return requestJson(
            "GET",
            "/api/usage",
            null
        );
    }

    public JSONObject chat(
        String message,
        String mode,
        String conversationId,
        List<Message> history,
        String fileName,
        String mimeType,
        byte[] fileBytes
    ) throws Exception {
        JSONObject body =
            new JSONObject();

        body.put(
            "message",
            message == null
                ? ""
                : message
        );

        body.put(
            "mode",
            mode == null
                ? "chat"
                : mode
        );

        body.put(
            "conversationId",
            conversationId
        );

        JSONArray items =
            new JSONArray();

        int start =
            Math.max(
                0,
                history.size() - 12
            );

        for (
            int i = start;
            i < history.size();
            i++
        ) {
            Message item =
                history.get(i);

            JSONObject row =
                new JSONObject();

            row.put(
                "role",
                item.user
                    ? "user"
                    : "assistant"
            );

            row.put(
                "content",
                item.content
            );

            items.put(row);
        }

        body.put(
            "history",
            items.toString()
        );

        if (fileBytes != null) {
            body.put(
                "fileName",
                fileName == null
                    ? "file"
                    : fileName
            );

            body.put(
                "mimeType",
                mimeType == null
                    ? "application/octet-stream"
                    : mimeType
            );

            body.put(
                "fileBytes",
                android.util.Base64
                    .encodeToString(
                        fileBytes,
                        android.util.Base64.NO_WRAP
                    )
            );
        }

        return requestJson(
            "POST",
            "/api/chat",
            body
        );
    }

    public JSONObject image(
        String prompt
    ) throws Exception {
        JSONObject body =
            new JSONObject();

        body.put(
            "prompt",
            prompt
        );

        return requestJson(
            "POST",
            "/api/image",
            body
        );
    }

    public byte[] tts(
        String text
    ) throws Exception {
        JSONObject body =
            new JSONObject();

        body.put(
            "text",
            text.substring(
                0,
                Math.min(
                    text.length(),
                    7000
                )
            )
        );

        body.put(
            "voice",
            "Kore"
        );

        return requestBytes(
            "POST",
            "/api/tts",
            body
        );
    }

    private JSONObject requestJson(
        String method,
        String path,
        JSONObject body
    ) throws Exception {
        byte[] data =
            body == null
                ? null
                : body.toString()
                    .getBytes(
                        StandardCharsets.UTF_8
                    );

        Response response =
            request(
                method,
                path,
                data,
                "application/json; charset=UTF-8"
            );

        JSONObject result =
            new JSONObject(
                response.text
            );

        if (response.code >= 400) {
            throw new Exception(
                result.optString(
                    "error",
                    "Erro do servidor."
                )
            );
        }

        return result;
    }

    private byte[] requestBytes(
        String method,
        String path,
        JSONObject body
    ) throws Exception {
        Response response =
            request(
                method,
                path,
                body.toString()
                    .getBytes(
                        StandardCharsets.UTF_8
                    ),
                "application/json; charset=UTF-8"
            );

        if (response.code >= 400) {
            String message =
                new String(
                    response.bytes,
                    StandardCharsets.UTF_8
                );

            try {
                JSONObject data =
                    new JSONObject(message);

                throw new Exception(
                    data.optString(
                        "error",
                        "Erro do servidor."
                    )
                );
            } catch (
                org.json.JSONException error
            ) {
                throw new Exception(
                    "Erro do servidor."
                );
            }
        }

        return response.bytes;
    }

    private Response request(
        String method,
        String path,
        byte[] body,
        String contentType
    ) throws Exception {
        URL url =
            new URL(
                BASE_URL + path
            );

        HttpURLConnection connection =
            (HttpURLConnection)
                url.openConnection();

        connection.setRequestMethod(
            method
        );

        connection.setConnectTimeout(
            20000
        );

        connection.setReadTimeout(
            120000
        );

        connection.setRequestProperty(
            "accept",
            "application/json"
        );

        connection.setRequestProperty(
            "x-nexora-device",
            deviceId
        );

        if (body != null) {
            connection.setDoOutput(
                true
            );

            connection.setRequestProperty(
                "content-type",
                contentType
            );

            OutputStream output =
                connection.getOutputStream();

            output.write(body);
            output.flush();
            output.close();
        }

        int code =
            connection.getResponseCode();

        InputStream input =
            code >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();

        byte[] bytes =
            readAll(input);

        connection.disconnect();

        return new Response(
            code,
            bytes
        );
    }

    private byte[] readAll(
        InputStream input
    ) throws Exception {
        if (input == null) {
            return new byte[0];
        }

        ByteArrayOutputStream output =
            new ByteArrayOutputStream();

        byte[] buffer =
            new byte[8192];

        int count;

        while (
            (count =
                input.read(buffer)) != -1
        ) {
            output.write(
                buffer,
                0,
                count
            );
        }

        input.close();

        return output.toByteArray();
    }

    public static final class Message {
        public final boolean user;
        public final String content;

        public Message(
            boolean user,
            String content
        ) {
            this.user = user;
            this.content = content;
        }
    }

    private static final class Response {
        final int code;
        final byte[] bytes;
        final String text;

        Response(
            int code,
            byte[] bytes
        ) {
            this.code = code;
            this.bytes = bytes;
            this.text =
                new String(
                    bytes,
                    StandardCharsets.UTF_8
                );
        }
    }
}

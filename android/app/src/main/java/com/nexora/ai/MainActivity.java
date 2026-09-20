package com.nexora.ai;

import android.Manifest;
import android.app.Activity;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 101;
    private static final int CAMERA_REQUEST = 102;

    private final String[] toolNames = {
        "Chat",
        "Trabalhos",
        "Resumos",
        "PDF",
        "Imagem",
        "Áudio",
        "Vídeo",
        "Código",
        "Gerar imagem"
    };

    private final String[] toolModes = {
        "chat",
        "work",
        "summary",
        "pdf",
        "image",
        "audio",
        "video",
        "code",
        "image-gen"
    };

    private LinearLayout messages;
    private ScrollView messageScroll;
    private EditText prompt;
    private TextView credits;
    private TextView fileLabel;
    private TextView modeLabel;
    private ProgressBar progress;

    private final List<NativeApi.Message> history =
        new ArrayList<>();

    private NativeApi api;
    private ExecutorService executor =
        Executors.newFixedThreadPool(2);

    private String mode = "chat";
    private String conversationId =
        UUID.randomUUID().toString();

    private Uri pendingFile;
    private String pendingFileName = "";

    private SpeechRecognizer speechRecognizer;
    private MediaPlayer mediaPlayer;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        String deviceId =
            getDeviceId();

        api =
            new NativeApi(
                deviceId
            );

        requestPermissionsIfNeeded();

        setContentView(
            R.layout.activity_main
        );

        bindViews();
        bindTools();
        bindActions();
        loadUsage();
    }

    private void bindViews() {
        messages =
            findViewById(
                R.id.messages
            );

        messageScroll =
            findViewById(
                R.id.messageScroll
            );

        prompt =
            findViewById(
                R.id.prompt
            );

        credits =
            findViewById(
                R.id.credits
            );

        fileLabel =
            findViewById(
                R.id.fileLabel
            );

        modeLabel =
            findViewById(
                R.id.modeLabel
            );

        progress =
            findViewById(
                R.id.progress
            );
    }

    private void bindTools() {
        int[] ids = {
            R.id.toolChat,
            R.id.toolWork,
            R.id.toolSummary,
            R.id.toolPdf,
            R.id.toolImage,
            R.id.toolAudio,
            R.id.toolVideo,
            R.id.toolCode,
            R.id.toolGenerate
        };

        for (
            int i = 0;
            i < ids.length;
            i++
        ) {
            final int index = i;

            Button button =
                findViewById(
                    ids[i]
                );

            button.setOnClickListener(
                view -> {
                    mode =
                        toolModes[index];

                    modeLabel.setText(
                        "Modo: " +
                        toolNames[index]
                    );

                    if (
                        mode.equals(
                            "image-gen"
                        )
                    ) {
                        prompt.setHint(
                            "Descreve a imagem que queres gerar…"
                        );
                    } else if (
                        mode.equals(
                            "image"
                        )
                    ) {
                        prompt.setHint(
                            "Adiciona uma imagem e faz uma pergunta…"
                        );
                    } else {
                        prompt.setHint(
                            "Mensagem para Nexora AI"
                        );
                    }
                }
            );
        }
    }

    private void bindActions() {
        ImageButton add =
            findViewById(
                R.id.addButton
            );

        add.setOnClickListener(
            view ->
                openFilePicker()
        );

        ImageButton camera =
            findViewById(
                R.id.cameraButton
            );

        camera.setOnClickListener(
            view ->
                openCamera()
        );

        ImageButton mic =
            findViewById(
                R.id.micButton
            );

        mic.setOnClickListener(
            view ->
                startVoiceInput()
        );

        Button send =
            findViewById(
                R.id.sendButton
            );

        send.setOnClickListener(
            view ->
                send()
        );
    }

    private void send() {
        if (
            prompt.getText()
                .toString()
                .trim()
                .isEmpty() &&
            pendingFile == null
        ) {
            showError(
                "Escreve uma mensagem ou adiciona um ficheiro."
            );
            return;
        }

        if (
            mode.equals(
                "image-gen"
            )
        ) {
            generateImage();
        } else {
            sendChat();
        }
    }

    private void sendChat() {
        String userText =
            prompt.getText()
                .toString()
                .trim();

        Uri file =
            pendingFile;

        String fileName =
            pendingFileName;

        prompt.setText("");

        pendingFile = null;
        pendingFileName = "";

        fileLabel.setVisibility(
            View.GONE
        );

        NativeApi.Message user =
            new NativeApi.Message(
                true,
                userText.isEmpty()
                    ? "Analisar ficheiro"
                    : userText
            );

        addMessage(
            user
        );

        setBusy(true);

        executor.execute(
            () -> {
                try {
                    byte[] bytes =
                        readUri(
                            file
                        );

                    String mime =
                        mimeFor(
                            file
                        );

                    String message =
                        userText;

                    if (
                        file != null &&
                        isTextFile(
                            fileName,
                            mime
                        )
                    ) {
                        String text =
                            new String(
                                bytes,
                                StandardCharsets.UTF_8
                            );

                        message =
                            userText.isEmpty()
                                ? text
                                : userText +
                                  "\n\n" +
                                  text;

                        bytes = null;
                    }

                    JSONObject result =
                        api.chat(
                            message,
                            mode,
                            conversationId,
                            historyBeforeUser(),
                            fileName,
                            mime,
                            bytes
                        );

                    String answer =
                        result.optString(
                            "answer",
                            "Não consegui produzir uma resposta."
                        );

                    int remaining =
                        result.optInt(
                            "remaining",
                            100
                        );

                    mainPost(
                        () -> {
                            addMessage(
                                new NativeApi.Message(
                                    false,
                                    answer
                                )
                            );

                            credits.setText(
                                remaining +
                                " créditos"
                            );

                            setBusy(
                                false
                            );
                        }
                    );
                } catch (Exception error) {
                    mainPost(
                        () -> {
                            addMessage(
                                new NativeApi.Message(
                                    false,
                                    error.getMessage() == null
                                        ? "Falha no processamento."
                                        : error.getMessage()
                                )
                            );

                            setBusy(
                                false
                            );
                        }
                    );
                }
            }
        );
    }

    private List<NativeApi.Message>
    historyBeforeUser() {
        return new ArrayList<>(
            history
        );
    }

    private void generateImage() {
        String value =
            prompt.getText()
                .toString()
                .trim();

        if (
            value.isEmpty()
        ) {
            showError(
                "Descreve a imagem que queres gerar."
            );
            return;
        }

        prompt.setText("");

        addMessage(
            new NativeApi.Message(
                true,
                value
            )
        );

        setBusy(true);

        executor.execute(
            () -> {
                try {
                    JSONObject result =
                        api.image(
                            value
                        );

                    String image =
                        result.optString(
                            "image",
                            ""
                        );

                    int remaining =
                        result.optInt(
                            "remaining",
                            90
                        );

                    mainPost(
                        () -> {
                            if (
                                image.startsWith(
                                    "data:image/"
                                )
                            ) {
                                showGeneratedImage(
                                    image
                                );
                            } else {
                                addMessage(
                                    new NativeApi.Message(
                                        false,
                                        "O servidor não devolveu uma imagem."
                                    )
                                );
                            }

                            credits.setText(
                                remaining +
                                " créditos"
                            );

                            setBusy(
                                false
                            );
                        }
                    );
                } catch (Exception error) {
                    mainPost(
                        () -> {
                            addMessage(
                                new NativeApi.Message(
                                    false,
                                    error.getMessage() == null
                                        ? "A geração de imagem falhou."
                                        : error.getMessage()
                                )
                            );

                            setBusy(
                                false
                            );
                        }
                    );
                }
            }
        );
    }

    private void addMessage(
        NativeApi.Message message
    ) {
        history.add(
            message
        );

        LinearLayout row =
            new LinearLayout(this);

        row.setOrientation(
            LinearLayout.HORIZONTAL
        );

        row.setPadding(
            0,
            dp(8),
            0,
            dp(8)
        );

        TextView avatar =
            new TextView(this);

        avatar.setGravity(
            android.view.Gravity.CENTER
        );

        avatar.setText(
            message.user
                ? "Tu"
                : "N"
        );

        avatar.setTextSize(
            11
        );

        avatar.setTextColor(
            message.user
                ? android.graphics.Color.rgb(
                    52,
                    85,
                    178
                )
                : android.graphics.Color.WHITE
        );

        avatar.setBackground(
            getDrawable(
                R.drawable.bg_soft
            )
        );

        if (!message.user) {
            avatar.setBackground(
                getDrawable(
                    R.drawable.bg_primary
                )
            );
        }

        row.addView(
            avatar,
            new LinearLayout.LayoutParams(
                dp(34),
                dp(34)
            )
        );

        TextView body =
            new TextView(this);

        body.setText(
            message.content
        );

        body.setTextColor(
            android.graphics.Color.rgb(
                23,
                32,
                51
            )
        );

        body.setTextSize(
            15
        );

        body.setLineSpacing(
            0,
            1.2f
        );

        body.setPadding(
            dp(10),
            0,
            0,
            0
        );

        row.addView(
            body,
            new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1
            )
        );

        messages.addView(
            row
        );

        messageScroll.post(
            () ->
                messageScroll.fullScroll(
                    View.FOCUS_DOWN
                )
        );
    }

    private void showGeneratedImage(
        String dataUri
    ) {
        int comma =
            dataUri.indexOf(",");

        if (comma < 0) {
            return;
        }

        byte[] bytes =
            android.util.Base64.decode(
                dataUri.substring(
                    comma + 1
                ),
                android.util.Base64.DEFAULT
            );

        Bitmap bitmap =
            BitmapFactory.decodeByteArray(
                bytes,
                0,
                bytes.length
            );

        if (bitmap == null) {
            addMessage(
                new NativeApi.Message(
                    false,
                    "Não foi possível apresentar a imagem."
                )
            );
            return;
        }

        ImageView image =
            new ImageView(this);

        image.setImageBitmap(
            bitmap
        );

        image.setAdjustViewBounds(
            true
        );

        image.setPadding(
            dp(44),
            dp(8),
            dp(8),
            dp(8)
        );

        messages.addView(
            image
        );

        messageScroll.post(
            () ->
                messageScroll.fullScroll(
                    View.FOCUS_DOWN
                )
        );
    }

    private void setBusy(
        boolean busy
    ) {
        mainPost(
            () -> {
                prompt.setEnabled(
                    !busy
                );

                findViewById(
                    R.id.sendButton
                ).setEnabled(
                    !busy
                );

                findViewById(
                    R.id.addButton
                ).setEnabled(
                    !busy
                );

                findViewById(
                    R.id.cameraButton
                ).setEnabled(
                    !busy
                );

                progress.setVisibility(
                    busy
                        ? View.VISIBLE
                        : View.GONE
                );
            }
        );
    }

    private void openFilePicker() {
        Intent intent =
            new Intent(
                Intent.ACTION_OPEN_DOCUMENT
            );

        intent.addCategory(
            Intent.CATEGORY_OPENABLE
        );

        intent.setType("*/*");

        startActivityForResult(
            intent,
            PICK_FILE
        );
    }

    private void openCamera() {
        if (
            android.os.Build.VERSION.SDK_INT >= 23 &&
            checkSelfPermission(
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            showError(
                "Permite o acesso à câmara."
            );
            return;
        }

        startActivityForResult(
            new Intent(
                MediaStore.ACTION_IMAGE_CAPTURE
            ),
            CAMERA_REQUEST
        );
    }

    @Override
    protected void onActivityResult(
        int requestCode,
        int resultCode,
        Intent data
    ) {
        super.onActivityResult(
            requestCode,
            resultCode,
            data
        );

        if (
            resultCode != RESULT_OK ||
            data == null
        ) {
            return;
        }

        if (
            requestCode ==
            PICK_FILE &&
            data.getData() != null
        ) {
            pendingFile =
                data.getData();

            pendingFileName =
                fileName(
                    pendingFile
                );

            fileLabel.setText(
                "Ficheiro: " +
                pendingFileName
            );

            fileLabel.setVisibility(
                View.VISIBLE
            );

            setModeFromFile(
                pendingFileName,
                mimeFor(
                    pendingFile
                )
            );

            return;
        }

        if (
            requestCode ==
            CAMERA_REQUEST &&
            data.getExtras() != null
        ) {
            Bitmap bitmap =
                (Bitmap) data
                    .getExtras()
                    .get("data");

            if (bitmap == null) {
                return;
            }

            try {
                File output =
                    new File(
                        getCacheDir(),
                        "camera_" +
                        System.currentTimeMillis() +
                        ".jpg"
                    );

                FileOutputStream stream =
                    new FileOutputStream(
                        output
                    );

                bitmap.compress(
                    Bitmap.CompressFormat.JPEG,
                    90,
                    stream
                );

                stream.close();

                pendingFile =
                    Uri.fromFile(
                        output
                    );

                pendingFileName =
                    output.getName();

                fileLabel.setText(
                    "Foto: " +
                    pendingFileName
                );

                fileLabel.setVisibility(
                    View.VISIBLE
                );

                mode =
                    "image";

                modeLabel.setText(
                    "Modo: Imagem"
                );
            } catch (Exception error) {
                showError(
                    "Não foi possível preparar a foto."
                );
            }
        }
    }

    private void setModeFromFile(
        String name,
        String mime
    ) {
        String lower =
            name.toLowerCase();

        if (
            mime.contains(
                "pdf"
            ) ||
            lower.endsWith(
                ".pdf"
            )
        ) {
            mode = "pdf";
        } else if (
            mime.startsWith(
                "image/"
            )
        ) {
            mode = "image";
        } else if (
            mime.startsWith(
                "audio/"
            )
        ) {
            mode = "audio";
        } else if (
            mime.startsWith(
                "video/"
            )
        ) {
            mode = "video";
        }

        modeLabel.setText(
            "Modo: " +
            toolName(mode)
        );
    }

    private String toolName(
        String value
    ) {
        for (
            int i = 0;
            i < toolModes.length;
            i++
        ) {
            if (
                toolModes[i].equals(
                    value
                )
            ) {
                return toolNames[i];
            }
        }

        return "Chat";
    }

    private boolean isTextFile(
        String name,
        String mime
    ) {
        String lower =
            name.toLowerCase();

        return mime.startsWith(
            "text/"
        ) ||
        mime.equals(
            "application/json"
        ) ||
        lower.endsWith(".txt") ||
        lower.endsWith(".md") ||
        lower.endsWith(".csv") ||
        lower.endsWith(".json") ||
        lower.endsWith(".js") ||
        lower.endsWith(".ts") ||
        lower.endsWith(".py") ||
        lower.endsWith(".html") ||
        lower.endsWith(".css") ||
        lower.endsWith(".java") ||
        lower.endsWith(".cpp") ||
        lower.endsWith(".c") ||
        lower.endsWith(".xml") ||
        lower.endsWith(".yaml") ||
        lower.endsWith(".yml") ||
        lower.endsWith(".srt");
    }

    private String mimeFor(
        Uri uri
    ) {
        if (
            uri == null
        ) {
            return "";
        }

        if (
            "file".equals(
                uri.getScheme()
            )
        ) {
            return "image/jpeg";
        }

        ContentResolver resolver =
            getContentResolver();

        String mime =
            resolver.getType(
                uri
            );

        return mime == null
            ? ""
            : mime;
    }

    private String fileName(
        Uri uri
    ) {
        String value =
            uri.getLastPathSegment();

        if (
            value == null ||
            value.isEmpty()
        ) {
            return "ficheiro";
        }

        int slash =
            value.lastIndexOf('/');

        return slash < 0
            ? value
            : value.substring(
                slash + 1
            );
    }

    private byte[] readUri(
        Uri uri
    ) throws Exception {
        if (
            uri == null
        ) {
            return null;
        }

        InputStream input;

        if (
            "file".equals(
                uri.getScheme()
            )
        ) {
            input =
                new java.io.FileInputStream(
                    new File(
                        uri.getPath()
                    )
                );
        } else {
            input =
                getContentResolver()
                    .openInputStream(
                        uri
                    );
        }

        if (
            input == null
        ) {
            throw new Exception(
                "Não foi possível ler o ficheiro."
            );
        }

        ByteArrayOutputStream output =
            new ByteArrayOutputStream();

        byte[] buffer =
            new byte[8192];

        int count;

        int total = 0;

        while (
            (count =
                input.read(buffer)) != -1
        ) {
            total += count;

            if (
                total >
                12 * 1024 * 1024
            ) {
                input.close();

                throw new Exception(
                    "O ficheiro deve ter até 12 MB."
                );
            }

            output.write(
                buffer,
                0,
                count
            );
        }

        input.close();

        return output.toByteArray();
    }

    private void loadUsage() {
        executor.execute(
            () -> {
                try {
                    JSONObject result =
                        api.usage();

                    int remaining =
                        result.optInt(
                            "remaining",
                            100
                        );

                    mainPost(
                        () ->
                            credits.setText(
                                remaining +
                                " créditos"
                            )
                    );
                } catch (Exception ignored) {
                }
            }
        );
    }

    private void startVoiceInput() {
        if (
            !SpeechRecognizer
                .isRecognitionAvailable(
                    this
                )
        ) {
            showError(
                "O ditado não está disponível neste telefone."
            );
            return;
        }

        if (
            speechRecognizer != null
        ) {
            speechRecognizer.destroy();
        }

        speechRecognizer =
            SpeechRecognizer
                .createSpeechRecognizer(
                    this
                );

        Intent intent =
            new Intent(
                RecognizerIntent
                    .ACTION_RECOGNIZE_SPEECH
            );

        intent.putExtra(
            RecognizerIntent
                .EXTRA_LANGUAGE_MODEL,
            RecognizerIntent
                .LANGUAGE_MODEL_FREE_FORM
        );

        intent.putExtra(
            RecognizerIntent
                .EXTRA_LANGUAGE,
            "pt-PT"
        );

        speechRecognizer
            .setRecognitionListener(
                new android.speech.RecognitionListener() {
                    @Override
                    public void onResults(
                        Bundle results
                    ) {
                        ArrayList<String>
                            values =
                            results.getStringArrayList(
                                SpeechRecognizer
                                    .RESULTS_RECOGNITION
                            );

                        if (
                            values != null &&
                            !values.isEmpty()
                        ) {
                            String current =
                                prompt
                                    .getText()
                                    .toString();

                            prompt.setText(
                                (
                                    current.isEmpty()
                                        ? ""
                                        : current +
                                          " "
                                ) +
                                values.get(0)
                            );

                            prompt.setSelection(
                                prompt.length()
                            );
                        }
                    }

                    @Override public void onReadyForSpeech(Bundle p) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float r) {}
                    @Override public void onBufferReceived(byte[] b) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onError(int e) {}
                    @Override public void onPartialResults(Bundle p) {}
                    @Override public void onEvent(int e, Bundle p) {}
                }
            );

        Toast.makeText(
            this,
            "Estou a ouvir…",
            Toast.LENGTH_SHORT
        ).show();

        speechRecognizer.startListening(
            intent
        );
    }

    private void speakText(
        String value
    ) {
        executor.execute(
            () -> {
                try {
                    byte[] audio =
                        api.tts(
                            value
                        );

                    File output =
                        new File(
                            getCacheDir(),
                            "nexora_voice.wav"
                        );

                    FileOutputStream stream =
                        new FileOutputStream(
                            output
                        );

                    stream.write(
                        audio
                    );

                    stream.close();

                    mainPost(
                        () ->
                            playAudio(
                                output
                            )
                    );
                } catch (Exception error) {
                    mainPost(
                        () ->
                            showError(
                                error.getMessage() == null
                                    ? "Falha na voz."
                                    : error.getMessage()
                            )
                    );
                }
            }
        );
    }

    private void playAudio(
        File file
    ) {
        try {
            if (
                mediaPlayer != null
            ) {
                mediaPlayer.release();
            }

            mediaPlayer =
                new MediaPlayer();

            mediaPlayer.setDataSource(
                file.getAbsolutePath()
            );

            mediaPlayer.setOnPreparedListener(
                MediaPlayer::start
            );

            mediaPlayer.setOnCompletionListener(
                player -> {
                    player.release();
                    mediaPlayer = null;
                }
            );

            mediaPlayer.prepareAsync();
        } catch (Exception error) {
            showError(
                "Não foi possível reproduzir a voz."
            );
        }
    }

    private String getDeviceId() {
        SharedPreferences prefs =
            getSharedPreferences(
                "nexora_native",
                MODE_PRIVATE
            );

        String value =
            prefs.getString(
                "device_id",
                null
            );

        if (
            value == null
        ) {
            value =
                UUID.randomUUID()
                    .toString()
                    .replace(
                        "-",
                        ""
                    ) +
                UUID.randomUUID()
                    .toString()
                    .replace(
                        "-",
                        "");

            value =
                value.substring(
                    0,
                    64
                );

            prefs.edit()
                .putString(
                    "device_id",
                    value
                )
                .apply();
        }

        return value;
    }

    private void requestPermissionsIfNeeded() {
        if (
            android.os.Build.VERSION.SDK_INT >= 23
        ) {
            requestPermissions(
                new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                },
                40
            );
        }
    }

    private void showError(
        String value
    ) {
        Toast.makeText(
            this,
            value,
            Toast.LENGTH_LONG
        ).show();
    }

    private int dp(
        int value
    ) {
        return Math.round(
            value *
            getResources()
                .getDisplayMetrics()
                .density
        );
    }

    private void mainPost(
        Runnable task
    ) {
        runOnUiThread(
            task
        );
    }

    @Override
    protected void onDestroy() {
        if (
            speechRecognizer != null
        ) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }

        if (
            mediaPlayer != null
        ) {
            mediaPlayer.release();
            mediaPlayer = null;
        }

        executor.shutdownNow();

        super.onDestroy();
    }
}

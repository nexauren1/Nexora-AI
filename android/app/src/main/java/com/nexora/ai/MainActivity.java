package com.nexora.ai;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
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
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
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
        "Criar imagem"
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
    private LinearLayout historyList;
    private ScrollView messageScroll;
    private EditText prompt;
    private TextView credits;
    private TextView fileLabel;
    private TextView modeLabel;
    private TextView statusLabel;
    private TextView settingsCredits;
    private TextView settingsConnection;
    private ProgressBar progress;
    private View welcome;

    private LinearLayout homePage;
    private LinearLayout historyPage;
    private View settingsPage;

    private final List<NativeApi.Message> history =
        new ArrayList<>();

    private NativeApi api;
    private final ExecutorService executor =
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

        api = new NativeApi(getDeviceId());

        setContentView(R.layout.activity_main);

        bindViews();
        bindNavigation();
        bindTools();
        bindActions();
        restoreHistory();
        updateHistoryPage();
        loadUsage();
        requestPermissionsIfNeeded();
    }

    private void bindViews() {
        messages = findViewById(R.id.messages);
        historyList = findViewById(R.id.historyList);
        messageScroll = findViewById(R.id.messageScroll);
        prompt = findViewById(R.id.prompt);
        credits = findViewById(R.id.credits);
        fileLabel = findViewById(R.id.fileLabel);
        modeLabel = findViewById(R.id.modeLabel);
        progress = findViewById(R.id.progress);
        statusLabel = findViewById(R.id.statusLabel);
        settingsCredits = findViewById(R.id.settingsCredits);
        settingsConnection = findViewById(R.id.settingsConnection);
        welcome = findViewById(R.id.welcome);
        homePage = findViewById(R.id.homePage);
        historyPage = findViewById(R.id.historyPage);
        settingsPage = findViewById(R.id.settingsPage);
    }

    private void bindNavigation() {
        findViewById(R.id.navHome).setOnClickListener(
            view -> showPage("home")
        );

        findViewById(R.id.navHistory).setOnClickListener(
            view -> {
                updateHistoryPage();
                showPage("history");
            }
        );

        findViewById(R.id.navSettings).setOnClickListener(
            view -> showPage("settings")
        );

        findViewById(R.id.menuButton).setOnClickListener(
            this::showMenu
        );
    }

    private void showPage(String page) {
        homePage.setVisibility(
            page.equals("home") ? View.VISIBLE : View.GONE
        );
        historyPage.setVisibility(
            page.equals("history") ? View.VISIBLE : View.GONE
        );
        settingsPage.setVisibility(
            page.equals("settings") ? View.VISIBLE : View.GONE
        );

        setNavSelected(R.id.navHome, page.equals("home"));
        setNavSelected(R.id.navHistory, page.equals("history"));
        setNavSelected(R.id.navSettings, page.equals("settings"));
    }

    private void setNavSelected(int id, boolean selected) {
        Button button = findViewById(id);
        button.setBackground(
            getDrawable(
                selected
                    ? R.drawable.bg_nav_selected
                    : android.R.color.transparent
            )
        );
        button.setTextColor(
            getResources().getColor(
                selected
                    ? R.color.nexora_primary
                    : R.color.nexora_muted
            )
        );
    }

    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);

        menu.getMenu().add("Novo chat").setOnMenuItemClickListener(
            item -> {
                clearConversation();
                showPage("home");
                return true;
            }
        );

        menu.getMenu().add("Histórico").setOnMenuItemClickListener(
            item -> {
                updateHistoryPage();
                showPage("history");
                return true;
            }
        );

        menu.getMenu().add("Definições").setOnMenuItemClickListener(
            item -> {
                showPage("settings");
                return true;
            }
        );

        menu.getMenu().add("Sobre o Nexora AI").setOnMenuItemClickListener(
            item -> {
                showAbout();
                return true;
            }
        );

        menu.show();
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

        for (int i = 0; i < ids.length; i++) {
            final int index = i;
            Button button = findViewById(ids[i]);

            button.setOnClickListener(
                view -> {
                    mode = toolModes[index];
                    updateToolSelection(ids, index);

                    modeLabel.setText(
                        "Modo: " + toolNames[index]
                    );

                    if (mode.equals("image-gen")) {
                        prompt.setHint(
                            "Descreve a imagem que queres criar…"
                        );
                    } else if (mode.equals("image")) {
                        prompt.setHint(
                            "Adiciona uma imagem e faz uma pergunta…"
                        );
                    } else if (mode.equals("pdf")) {
                        prompt.setHint(
                            "Adiciona um PDF e diz o que precisas…"
                        );
                    } else {
                        prompt.setHint(
                            "Mensagem para Nexora AI"
                        );
                    }

                    showPage("home");
                }
            );
        }

        updateToolSelection(ids, 0);
    }

    private void updateToolSelection(int[] ids, int selected) {
        for (int i = 0; i < ids.length; i++) {
            Button button = findViewById(ids[i]);

            button.setBackground(
                getDrawable(
                    i == selected
                        ? R.drawable.bg_nav_selected
                        : R.drawable.bg_tool
                )
            );

            button.setTextColor(
                getResources().getColor(
                    i == selected
                        ? R.color.nexora_primary
                        : R.color.nexora_muted
                )
            );
        }
    }

    private void bindActions() {
        findViewById(R.id.addButton).setOnClickListener(
            view -> openFilePicker()
        );

        findViewById(R.id.cameraButton).setOnClickListener(
            view -> openCamera()
        );

        findViewById(R.id.micButton).setOnClickListener(
            view -> startVoiceInput()
        );

        findViewById(R.id.sendButton).setOnClickListener(
            view -> send()
        );

        findViewById(R.id.clearHistoryButton).setOnClickListener(
            view -> clearConversation()
        );

        findViewById(R.id.clearSettingsButton).setOnClickListener(
            view -> clearConversation()
        );

        findViewById(R.id.aboutButton).setOnClickListener(
            view -> showAbout()
        );

        findViewById(R.id.privacyButton).setOnClickListener(
            view -> showPrivacy()
        );
    }

    private void send() {
        String text = prompt.getText().toString().trim();

        if (text.isEmpty() && pendingFile == null) {
            showError(
                "Escreve uma mensagem ou adiciona um ficheiro."
            );
            return;
        }

        if (mode.equals("image-gen")) {
            generateImage();
        } else {
            sendChat();
        }
    }

    private void sendChat() {
        String userText = prompt.getText().toString().trim();
        Uri file = pendingFile;
        String fileName = pendingFileName;

        prompt.setText("");
        pendingFile = null;
        pendingFileName = "";
        fileLabel.setVisibility(View.GONE);

        NativeApi.Message user = new NativeApi.Message(
            true,
            userText.isEmpty()
                ? "Analisar ficheiro"
                : userText
        );

        addMessage(user);
        setBusy(true);

        executor.execute(
            () -> {
                try {
                    byte[] bytes = readUri(file);
                    String mime = mimeFor(file);
                    String message = userText;

                    if (
                        file != null &&
                        isTextFile(fileName, mime)
                    ) {
                        String fileText = new String(
                            bytes,
                            StandardCharsets.UTF_8
                        );

                        message = userText.isEmpty()
                            ? fileText
                            : userText + "\n\n" + fileText;

                        bytes = null;
                    }

                    JSONObject result = api.chat(
                        message,
                        mode,
                        conversationId,
                        historyBeforeUser(),
                        fileName,
                        mime,
                        bytes
                    );

                    String answer = result.optString(
                        "answer",
                        "Não consegui produzir uma resposta."
                    );

                    int remaining = result.optInt(
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

                            updateCredits(remaining);
                            statusLabel.setText("Ligado");
                            statusLabel.setTextColor(
                                getResources().getColor(
                                    R.color.nexora_success
                                )
                            );
                            settingsConnection.setText(
                                "Ligação com o Nexora Worker ativa."
                            );
                            setBusy(false);
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

                            statusLabel.setText("Erro de ligação");
                            statusLabel.setTextColor(
                                getResources().getColor(
                                    R.color.nexora_danger
                                )
                            );
                            settingsConnection.setText(
                                "Não foi possível concluir o pedido."
                            );
                            setBusy(false);
                        }
                    );
                }
            }
        );
    }

    private List<NativeApi.Message> historyBeforeUser() {
        int size = history.size();

        if (size <= 1) {
            return new ArrayList<>();
        }

        return new ArrayList<>(
            history.subList(
                0,
                size - 1
            )
        );
    }

    private void generateImage() {
        String value = prompt.getText().toString().trim();

        if (value.isEmpty()) {
            showError(
                "Descreve a imagem que queres criar."
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
                    JSONObject result = api.image(value);

                    String image = result.optString(
                        "image",
                        ""
                    );

                    int remaining = result.optInt(
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
                                showGeneratedImage(image);
                            } else {
                                addMessage(
                                    new NativeApi.Message(
                                        false,
                                        "O servidor não devolveu uma imagem."
                                    )
                                );
                            }

                            updateCredits(remaining);
                            statusLabel.setText("Ligado");
                            setBusy(false);
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

                            setBusy(false);
                        }
                    );
                }
            }
        );
    }

    private void addMessage(NativeApi.Message message) {
        history.add(message);
        saveHistory();

        if (welcome != null) {
            welcome.setVisibility(View.GONE);
        }

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(7), 0, dp(7));
        row.setGravity(Gravity.TOP);

        TextView avatar = new TextView(this);
        avatar.setGravity(Gravity.CENTER);
        avatar.setText(
            message.user ? "Tu" : "N"
        );
        avatar.setTextSize(10);
        avatar.setTextStyle(android.graphics.Typeface.BOLD);
        avatar.setTextColor(
            message.user
                ? getResources().getColor(R.color.nexora_primary)
                : getResources().getColor(R.color.white)
        );
        avatar.setBackground(
            getDrawable(
                message.user
                    ? R.drawable.bg_soft
                    : R.drawable.bg_primary
            )
        );

        row.addView(
            avatar,
            new LinearLayout.LayoutParams(
                dp(34),
                dp(34)
            )
        );

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(10), 0, 0, 0);

        TextView body = new TextView(this);
        body.setText(message.content);
        body.setTextColor(
            getResources().getColor(R.color.nexora_text)
        );
        body.setTextSize(14);
        body.setLineSpacing(0, 1.2f);

        content.addView(
            body,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        );

        if (!message.user) {
            LinearLayout actions = new LinearLayout(this);
            actions.setGravity(Gravity.START);
            actions.setPadding(0, dp(4), 0, 0);

            Button copy = new Button(this);
            copy.setText("Copiar");
            copy.setTextAllCaps(false);
            copy.setTextSize(10);
            copy.setMinWidth(0);
            copy.setMinHeight(0);
            copy.setPadding(dp(10), 0, dp(10), 0);
            copy.setTextColor(
                getResources().getColor(R.color.nexora_muted)
            );
            copy.setBackground(
                getDrawable(R.drawable.bg_soft)
            );

            copy.setOnClickListener(
                view -> copyText(message.content)
            );

            actions.addView(
                copy,
                new LinearLayout.LayoutParams(
                    dp(76),
                    dp(34)
                )
            );

            Button listen = new Button(this);
            listen.setText("Ouvir");
            listen.setTextAllCaps(false);
            listen.setTextSize(10);
            listen.setMinWidth(0);
            listen.setMinHeight(0);
            listen.setPadding(dp(10), 0, dp(10), 0);
            listen.setTextColor(
                getResources().getColor(R.color.nexora_primary)
            );
            listen.setBackground(
                getDrawable(R.drawable.bg_nav_selected)
            );

            listen.setOnClickListener(
                view -> speakText(message.content)
            );

            actions.addView(
                listen,
                new LinearLayout.LayoutParams(
                    dp(66),
                    dp(34)
                )
            );

            content.addView(actions);
        }

        row.addView(
            content,
            new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1
            )
        );

        messages.addView(row);

        messageScroll.post(
            () -> messageScroll.fullScroll(View.FOCUS_DOWN)
        );

        updateHistoryPage();
    }

    private void showGeneratedImage(String dataUri) {
        int comma = dataUri.indexOf(",");

        if (comma < 0) {
            return;
        }

        byte[] bytes = android.util.Base64.decode(
            dataUri.substring(comma + 1),
            android.util.Base64.DEFAULT
        );

        Bitmap bitmap = BitmapFactory.decodeByteArray(
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

        ImageView image = new ImageView(this);
        image.setImageBitmap(bitmap);
        image.setAdjustViewBounds(true);
        image.setPadding(
            dp(44),
            dp(8),
            dp(8),
            dp(12)
        );

        messages.addView(image);

        TextView caption = new TextView(this);
        caption.setText("Imagem criada pelo Nexora AI");
        caption.setTextSize(10);
        caption.setTextColor(
            getResources().getColor(R.color.nexora_muted)
        );
        caption.setPadding(
            dp(44),
            0,
            dp(8),
            dp(8)
        );
        messages.addView(caption);

        messageScroll.post(
            () -> messageScroll.fullScroll(View.FOCUS_DOWN)
        );
    }

    private void updateCredits(int remaining) {
        String value = remaining + " créditos";
        credits.setText(value);
        settingsCredits.setText(
            "Créditos disponíveis: " + remaining
        );
    }

    private void updateHistoryPage() {
        historyList.removeAllViews();

        if (history.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText(
                "Ainda não há mensagens nesta sessão.\n\nVolta ao Início para começar."
            );
            empty.setTextColor(
                getResources().getColor(R.color.nexora_muted)
            );
            empty.setTextSize(13);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(
                dp(20),
                dp(50),
                dp(20),
                dp(20)
            );

            historyList.addView(empty);
            return;
        }

        for (NativeApi.Message message : history) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(
                dp(14),
                dp(12),
                dp(14),
                dp(12)
            );
            card.setBackground(
                getDrawable(R.drawable.bg_card)
            );

            TextView who = new TextView(this);
            who.setText(
                message.user ? "Tu" : "Nexora AI"
            );
            who.setTextColor(
                getResources().getColor(
                    message.user
                        ? R.color.nexora_primary
                        : R.color.nexora_text
                )
            );
            who.setTextSize(11);
            who.setTextStyle(
                android.graphics.Typeface.BOLD
            );

            TextView value = new TextView(this);
            value.setText(message.content);
            value.setTextColor(
                getResources().getColor(R.color.nexora_text)
            );
            value.setTextSize(12);
            value.setLineSpacing(0, 1.2f);
            value.setPadding(0, dp(4), 0, 0);

            card.addView(who);
            card.addView(value);

            LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );

            params.setMargins(
                0,
                0,
                0,
                dp(8)
            );

            historyList.addView(card, params);
        }
    }

    private void clearConversation() {
        history.clear();
        saveHistory();

        conversationId = UUID.randomUUID().toString();
        mode = "chat";

        messages.removeAllViews();
        messages.addView(welcome);
        welcome.setVisibility(View.VISIBLE);

        updateToolSelection(
            new int[] {
                R.id.toolChat,
                R.id.toolWork,
                R.id.toolSummary,
                R.id.toolPdf,
                R.id.toolImage,
                R.id.toolAudio,
                R.id.toolVideo,
                R.id.toolCode,
                R.id.toolGenerate
            },
            0
        );

        modeLabel.setText("Modo: Chat");
        prompt.setHint("Mensagem para Nexora AI");
        fileLabel.setVisibility(View.GONE);
        pendingFile = null;
        pendingFileName = "";

        updateHistoryPage();
    }

    private void restoreHistory() {
        try {
            SharedPreferences prefs = getSharedPreferences(
                "nexora_native",
                MODE_PRIVATE
            );

            String raw = prefs.getString(
                "history",
                ""
            );

            if (raw.isEmpty()) {
                return;
            }

            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);

                history.add(
                    new NativeApi.Message(
                        item.optBoolean("user"),
                        item.optString("content")
                    )
                );
            }

            for (NativeApi.Message message : history) {
                renderRestoredMessage(message);
            }

            welcome.setVisibility(
                history.isEmpty()
                    ? View.VISIBLE
                    : View.GONE
            );
        } catch (Exception ignored) {
        }
    }

    private void renderRestoredMessage(
        NativeApi.Message message
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(7), 0, dp(7));

        TextView avatar = new TextView(this);
        avatar.setGravity(Gravity.CENTER);
        avatar.setText(message.user ? "Tu" : "N");
        avatar.setTextSize(10);
        avatar.setTextColor(
            message.user
                ? getResources().getColor(R.color.nexora_primary)
                : getResources().getColor(R.color.white)
        );
        avatar.setBackground(
            getDrawable(
                message.user
                    ? R.drawable.bg_soft
                    : R.drawable.bg_primary
            )
        );

        TextView body = new TextView(this);
        body.setText(message.content);
        body.setTextSize(14);
        body.setTextColor(
            getResources().getColor(R.color.nexora_text)
        );
        body.setPadding(dp(10), 0, 0, 0);

        row.addView(
            avatar,
            new LinearLayout.LayoutParams(
                dp(34),
                dp(34)
            )
        );

        row.addView(
            body,
            new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1
            )
        );

        messages.addView(row);
    }

    private void saveHistory() {
        try {
            JSONArray array = new JSONArray();

            int start = Math.max(0, history.size() - 40);

            for (int i = start; i < history.size(); i++) {
                NativeApi.Message message = history.get(i);

                JSONObject item = new JSONObject();
                item.put("user", message.user);
                item.put("content", message.content);
                array.put(item);
            }

            getSharedPreferences(
                "nexora_native",
                MODE_PRIVATE
            ).edit()
                .putString("history", array.toString())
                .apply();
        } catch (Exception ignored) {
        }
    }

    private void copyText(String value) {
        ClipboardManager clipboard =
            (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);

        clipboard.setPrimaryClip(
            ClipData.newPlainText(
                "Nexora AI",
                value
            )
        );

        Toast.makeText(
            this,
            "Resposta copiada.",
            Toast.LENGTH_SHORT
        ).show();
    }

    private void setBusy(boolean busy) {
        mainPost(
            () -> {
                prompt.setEnabled(!busy);

                int[] ids = {
                    R.id.sendButton,
                    R.id.addButton,
                    R.id.cameraButton,
                    R.id.micButton,
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

                for (int id : ids) {
                    findViewById(id).setEnabled(!busy);
                }

                progress.setVisibility(
                    busy ? View.VISIBLE : View.GONE
                );
            }
        );
    }

    private void openFilePicker() {
        Intent intent = new Intent(
            Intent.ACTION_OPEN_DOCUMENT
        );

        intent.addCategory(
            Intent.CATEGORY_OPENABLE
        );

        intent.setType("*/*");

        startActivityForResult(intent, PICK_FILE);
    }

    private void openCamera() {
        if (
            android.os.Build.VERSION.SDK_INT >= 23 &&
            checkSelfPermission(
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            showError("Permite o acesso à câmara.");
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

        if (resultCode != RESULT_OK || data == null) {
            return;
        }

        if (
            requestCode == PICK_FILE &&
            data.getData() != null
        ) {
            pendingFile = data.getData();
            pendingFileName = fileName(pendingFile);

            fileLabel.setText(
                "Anexo: " + pendingFileName
            );
            fileLabel.setVisibility(View.VISIBLE);

            setModeFromFile(
                pendingFileName,
                mimeFor(pendingFile)
            );

            return;
        }

        if (
            requestCode == CAMERA_REQUEST &&
            data.getExtras() != null
        ) {
            Bitmap bitmap = (Bitmap) data
                .getExtras()
                .get("data");

            if (bitmap == null) {
                return;
            }

            try {
                File output = new File(
                    getCacheDir(),
                    "camera_" +
                    System.currentTimeMillis() +
                    ".jpg"
                );

                FileOutputStream stream =
                    new FileOutputStream(output);

                bitmap.compress(
                    Bitmap.CompressFormat.JPEG,
                    90,
                    stream
                );

                stream.close();

                pendingFile = Uri.fromFile(output);
                pendingFileName = output.getName();

                fileLabel.setText(
                    "Foto pronta: " + pendingFileName
                );
                fileLabel.setVisibility(View.VISIBLE);

                mode = "image";
                modeLabel.setText("Modo: Imagem");
                showPage("home");
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
        String lower = name.toLowerCase();

        if (
            mime.contains("pdf") ||
            lower.endsWith(".pdf")
        ) {
            mode = "pdf";
        } else if (mime.startsWith("image/")) {
            mode = "image";
        } else if (mime.startsWith("audio/")) {
            mode = "audio";
        } else if (mime.startsWith("video/")) {
            mode = "video";
        }

        modeLabel.setText(
            "Modo: " + toolName(mode)
        );
        showPage("home");
    }

    private String toolName(String value) {
        for (int i = 0; i < toolModes.length; i++) {
            if (toolModes[i].equals(value)) {
                return toolNames[i];
            }
        }

        return "Chat";
    }

    private boolean isTextFile(
        String name,
        String mime
    ) {
        String lower = name.toLowerCase();

        return mime.startsWith("text/") ||
            mime.equals("application/json") ||
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

    private String mimeFor(Uri uri) {
        if (uri == null) {
            return "";
        }

        if ("file".equals(uri.getScheme())) {
            return "image/jpeg";
        }

        ContentResolver resolver = getContentResolver();
        String mime = resolver.getType(uri);

        return mime == null ? "" : mime;
    }

    private String fileName(Uri uri) {
        String value = uri.getLastPathSegment();

        if (value == null || value.isEmpty()) {
            return "ficheiro";
        }

        int slash = value.lastIndexOf('/');

        return slash < 0
            ? value
            : value.substring(slash + 1);
    }

    private byte[] readUri(Uri uri) throws Exception {
        if (uri == null) {
            return null;
        }

        InputStream input;

        if ("file".equals(uri.getScheme())) {
            input = new java.io.FileInputStream(
                new File(uri.getPath())
            );
        } else {
            input = getContentResolver()
                .openInputStream(uri);
        }

        if (input == null) {
            throw new Exception(
                "Não foi possível ler o ficheiro."
            );
        }

        ByteArrayOutputStream output =
            new ByteArrayOutputStream();

        byte[] buffer = new byte[8192];
        int count;
        int total = 0;

        while ((count = input.read(buffer)) != -1) {
            total += count;

            if (total > 12 * 1024 * 1024) {
                input.close();

                throw new Exception(
                    "O ficheiro deve ter até 12 MB."
                );
            }

            output.write(buffer, 0, count);
        }

        input.close();

        return output.toByteArray();
    }

    private void loadUsage() {
        statusLabel.setText("A ligar…");

        executor.execute(
            () -> {
                try {
                    JSONObject result = api.usage();

                    int remaining = result.optInt(
                        "remaining",
                        100
                    );

                    mainPost(
                        () -> {
                            updateCredits(remaining);
                            statusLabel.setText("Ligado");
                            statusLabel.setTextColor(
                                getResources().getColor(
                                    R.color.nexora_success
                                )
                            );
                            settingsConnection.setText(
                                "Ligação com o Nexora Worker ativa."
                            );
                        }
                    );
                } catch (Exception error) {
                    mainPost(
                        () -> {
                            statusLabel.setText(
                                "Offline"
                            );
                            statusLabel.setTextColor(
                                getResources().getColor(
                                    R.color.nexora_warning
                                )
                            );
                            settingsConnection.setText(
                                "Sem ligação ao servidor. Verifica a internet."
                            );
                        }
                    );
                }
            }
        );
    }

    private void startVoiceInput() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            showError(
                "O ditado não está disponível neste telefone."
            );
            return;
        }

        if (speechRecognizer != null) {
            speechRecognizer.destroy();
        }

        speechRecognizer =
            SpeechRecognizer.createSpeechRecognizer(this);

        Intent intent = new Intent(
            RecognizerIntent.ACTION_RECOGNIZE_SPEECH
        );

        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        );

        intent.putExtra(
            RecognizerIntent.EXTRA_LANGUAGE,
            "pt-PT"
        );

        speechRecognizer.setRecognitionListener(
            new android.speech.RecognitionListener() {
                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> values =
                        results.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION
                        );

                    if (
                        values != null &&
                        !values.isEmpty()
                    ) {
                        String current =
                            prompt.getText().toString();

                        prompt.setText(
                            (
                                current.isEmpty()
                                    ? ""
                                    : current + " "
                            ) + values.get(0)
                        );

                        prompt.setSelection(
                            prompt.length()
                        );
                    }
                }

                @Override
                public void onReadyForSpeech(Bundle p) {}

                @Override
                public void onBeginningOfSpeech() {}

                @Override
                public void onRmsChanged(float r) {}

                @Override
                public void onBufferReceived(byte[] b) {}

                @Override
                public void onEndOfSpeech() {}

                @Override
                public void onError(int e) {}

                @Override
                public void onPartialResults(Bundle p) {}

                @Override
                public void onEvent(int e, Bundle p) {}
            }
        );

        Toast.makeText(
            this,
            "Estou a ouvir…",
            Toast.LENGTH_SHORT
        ).show();

        speechRecognizer.startListening(intent);
    }

    private void speakText(String value) {
        executor.execute(
            () -> {
                try {
                    byte[] audio = api.tts(value);

                    File output = new File(
                        getCacheDir(),
                        "nexora_voice.wav"
                    );

                    FileOutputStream stream =
                        new FileOutputStream(output);

                    stream.write(audio);
                    stream.close();

                    mainPost(
                        () -> playAudio(output)
                    );
                } catch (Exception error) {
                    mainPost(
                        () -> showError(
                            error.getMessage() == null
                                ? "Falha na voz."
                                : error.getMessage()
                        )
                    );
                }
            }
        );
    }

    private void playAudio(File file) {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(file.getAbsolutePath());

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

    private void showAbout() {
        new AlertDialog.Builder(this)
            .setTitle("Nexora AI")
            .setMessage(
                "Assistente de IA nativo para Android.\n\n" +
                "Chat, análise de ficheiros, imagens, voz e ferramentas especializadas.\n\n" +
                "Versão nativa 0.3."
            )
            .setPositiveButton("Fechar", null)
            .show();
    }

    private void showPrivacy() {
        new AlertDialog.Builder(this)
            .setTitle("Privacidade")
            .setMessage(
                "O app usa a ligação de rede apenas para comunicar com o Nexora Worker e processar os pedidos necessários.\n\n" +
                "Os ficheiros escolhidos são enviados somente quando são usados numa ferramenta."
            )
            .setPositiveButton("Fechar", null)
            .show();
    }

    private String getDeviceId() {
        SharedPreferences prefs =
            getSharedPreferences(
                "nexora_native",
                MODE_PRIVATE
            );

        String value = prefs.getString(
            "device_id",
            null
        );

        if (value == null) {
            value =
                UUID.randomUUID().toString().replace("-", "") +
                UUID.randomUUID().toString().replace("-", "");

            value = value.substring(0, 64);

            prefs.edit()
                .putString("device_id", value)
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

    private void showError(String value) {
        Toast.makeText(
            this,
            value,
            Toast.LENGTH_LONG
        ).show();
    }

    private int dp(int value) {
        return Math.round(
            value *
            getResources()
                .getDisplayMetrics()
                .density
        );
    }

    private void mainPost(Runnable task) {
        runOnUiThread(task);
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }

        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }

        executor.shutdownNow();

        super.onDestroy();
    }
}

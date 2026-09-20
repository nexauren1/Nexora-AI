package com.nexora.ai

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

data class ChatMessage(
    val user: Boolean,
    val text: String,
    val imageData: String? = null
)

data class SelectedFile(
    val uri: Uri,
    val name: String,
    val mime: String
)

class MainActivity : ComponentActivity() {
    private fun deviceId(): String {
        val p = getSharedPreferences("nexora", MODE_PRIVATE)
        val old = p.getString("device", null)
        if (old != null) return old
        val value = (UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", "").take(64)
        p.edit().putString("device", value).apply()
        return value
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setContent { NexoraApp(deviceId()) }
    }
}

@Composable
private fun NexoraApp(deviceId: String) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val api = remember { NexoraApi(deviceId) }
    val messages = remember { mutableStateListOf<ChatMessage>() }

    var page by remember { mutableStateOf("home") }
    var mode by remember { mutableStateOf("chat") }
    var input by remember { mutableStateOf(TextFieldValue("")) }
    var file by remember { mutableStateOf<SelectedFile?>(null) }
    var credits by remember { mutableStateOf(100) }
    var online by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {
        if (it != null) {
            val name = displayName(context, it)
            val mime = context.contentResolver.getType(it).orEmpty()
            file = SelectedFile(it, name, mime)
            mode = when {
                mime == "application/pdf" || name.endsWith(".pdf", true) -> "pdf"
                mime.startsWith("image/") -> "image"
                mime.startsWith("audio/") -> "audio"
                mime.startsWith("video/") -> "video"
                else -> mode
            }
        }
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            val out = File(context.cacheDir, "photo_" + System.currentTimeMillis() + ".jpg")
            FileOutputStream(out).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }
            file = SelectedFile(Uri.fromFile(out), out.name, "image/jpeg")
            mode = "image"
        }
    }

    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        if (it) camera.launch(null) else notice = "A permissão da câmara foi recusada."
    }

    LaunchedEffect(Unit) {
        try {
            credits = withContext(Dispatchers.IO) { api.usage().optInt("remaining", 100) }
            online = true
        } catch (_: Exception) {
            online = false
        }
    }

    fun send() {
        val text = input.text.trim()
        if (text.isEmpty() && file == null) {
            notice = "Escreve uma mensagem ou adiciona um ficheiro."
            return
        }

        val oldFile = file
        file = null
        input = TextFieldValue("")
        messages.add(ChatMessage(true, if (text.isEmpty()) "Analisar ficheiro" else text))
        busy = true

        scope.launch {
            try {
                if (mode == "image-gen") {
                    val result = withContext(Dispatchers.IO) { api.image(text) }
                    credits = result.optInt("remaining", credits)
                    val data = result.optString("image")
                    messages.add(ChatMessage(false, "Imagem criada pelo Nexora AI.", data.takeIf { it.startsWith("data:image/") }))
                } else {
                    val bytes = oldFile?.let { withContext(Dispatchers.IO) { readBytes(context, it.uri) } }
                    val result = withContext(Dispatchers.IO) {
                        api.chat(
                            text,
                            mode,
                            UUID.randomUUID().toString(),
                            messages.dropLast(1).takeLast(12),
                            oldFile?.name,
                            oldFile?.mime,
                            bytes
                        )
                    }
                    messages.add(ChatMessage(false, result.optString("answer", "Não consegui produzir uma resposta.")))
                    credits = result.optInt("remaining", credits)
                }
                online = true
            } catch (e: Exception) {
                messages.add(ChatMessage(false, e.message ?: "Não foi possível concluir o pedido."))
                online = false
            } finally {
                busy = false
            }
        }
    }

    MaterialTheme(colorScheme = lightColorScheme(
        primary = Color(0xFF315EF6),
        background = Color(0xFFF7F9FC),
        surface = Color.White,
        onSurface = Color(0xFF172033)
    )) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Nexora AI", fontWeight = FontWeight.Bold)
                            Text(if (online) "Online" else "A ligar…", fontSize = 11.sp)
                        }
                    },
                    actions = {
                        Text(credits.toString() + " créditos", color = MaterialTheme.colorScheme.primary, fontSize = 12.sp)
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = { page = "settings" }) { Text("•••") }
                    }
                )
            },
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(page == "home", { page = "home" }, { Text("⌂") }, { Text("Início") })
                    NavigationBarItem(page == "history", { page = "history" }, { Text("◷") }, { Text("Histórico") })
                    NavigationBarItem(page == "settings", { page = "settings" }, { Text("⚙") }, { Text("Definições") })
                }
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                when (page) {
                    "home" -> Home(
                        mode, { mode = it }, input, { input = it }, file,
                        { picker.launch(arrayOf("*/*")) },
                        {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                camera.launch(null)
                            } else cameraPermission.launch(Manifest.permission.CAMERA)
                        },
                        { notice = "O ditado de voz será ligado numa próxima etapa nativa." },
                        { send() }, messages, busy,
                        { copy(context, it) },
                        { speak(context, api, it) }
                    )
                    "history" -> History(messages)
                    else -> Settings(
                        credits, online,
                        { messages.clear(); page = "home" },
                        { notice = "Nexora AI 0.5 — app Android nativo feito em Kotlin + Jetpack Compose." },
                        { notice = "Os pedidos passam pelo Cloudflare Worker. Ficheiros só são enviados quando escolhidos." }
                    )
                }
                if (busy) {
                    Surface(
                        Modifier.align(Alignment.TopCenter).padding(8.dp),
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.primary,
                        shadowElevation = 5.dp
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(8.dp))
                            Text("A processar…", color = Color.White, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }

    notice?.let {
        AlertDialog(
            onDismissRequest = { notice = null },
            title = { Text("Nexora AI") },
            text = { Text(it) },
            confirmButton = { TextButton({ notice = null }) { Text("OK") } }
        )
    }
}

@Composable
private fun Home(
    mode: String,
    onMode: (String) -> Unit,
    input: TextFieldValue,
    onInput: (TextFieldValue) -> Unit,
    file: SelectedFile?,
    onFile: () -> Unit,
    onCamera: () -> Unit,
    onMic: () -> Unit,
    onSend: () -> Unit,
    messages: List<ChatMessage>,
    busy: Boolean,
    onCopy: (String) -> Unit,
    onSpeak: (String) -> Unit
) {
    val tools = listOf(
        "chat" to "Chat", "work" to "Trabalhos", "summary" to "Resumos",
        "pdf" to "PDF", "image" to "Imagem", "audio" to "Áudio",
        "video" to "Vídeo", "code" to "Código", "image-gen" to "Criar imagem"
    )

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            tools.forEach { item ->
                val selected = mode == item.first
                Surface(
                    Modifier.clickable { onMode(item.first) },
                    shape = RoundedCornerShape(18.dp),
                    color = if (selected) MaterialTheme.colorScheme.primary else Color.White,
                    border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary else Color(0xFFE2E7F0))
                ) {
                    Text(
                        item.second,
                        Modifier.padding(horizontal = 13.dp, vertical = 9.dp),
                        color = if (selected) Color.White else Color(0xFF53617A),
                        fontSize = 12.sp
                    )
                }
            }
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 14.dp)
        ) {
            if (messages.isEmpty()) {
                Spacer(Modifier.height(38.dp))
                Surface(Modifier.align(Alignment.CenterHorizontally), CircleShape, color = MaterialTheme.colorScheme.primary) {
                    Text("N", Modifier.padding(18.dp), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 21.sp)
                }
                Text("Como posso ajudar?", Modifier.fillMaxWidth().padding(top = 14.dp), textAlign = TextAlign.Center, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Conversa, ficheiros, imagens e ferramentas num único app.",
                    Modifier.fillMaxWidth().padding(top = 6.dp),
                    textAlign = TextAlign.Center, color = Color(0xFF6C7890), fontSize = 13.sp
                )
            }
            messages.forEach {
                Message(it, onCopy, onSpeak)
                Spacer(Modifier.height(9.dp))
            }
            file?.let {
                Text("Anexo: " + it.name, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, modifier = Modifier.padding(8.dp))
            }
            Spacer(Modifier.height(8.dp))
        }

        Divider()
        Row(Modifier.fillMaxWidth().background(Color.White).padding(7.dp), verticalAlignment = Alignment.Bottom) {
            IconButton(onFile, enabled = !busy) { Text("+", fontSize = 26.sp) }
            IconButton(onCamera, enabled = !busy) { Text("◉", fontSize = 20.sp) }
            BasicTextField(
                input, onInput, Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Color(0xFFF1F4F8)).padding(13.dp),
                textStyle = LocalTextStyle.current.copy(fontSize = 15.sp),
                maxLines = 5,
                decorationBox = { inner ->
                    if (input.text.isEmpty()) Text(if (mode == "image-gen") "Descreve a imagem…" else "Mensagem para Nexora AI…", color = Color(0xFF8994A8))
                    inner()
                }
            )
            IconButton(onMic, enabled = !busy) { Text("♩", fontSize = 21.sp) }
            Button(onSend, enabled = !busy, modifier = Modifier.size(52.dp), shape = RoundedCornerShape(15.dp), contentPadding = PaddingValues(0.dp)) { Text("↑", fontSize = 20.sp) }
        }
    }
}

@Composable
private fun Message(message: ChatMessage, onCopy: (String) -> Unit, onSpeak: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Surface(CircleShape, color = if (message.user) Color(0xFFEAF0FF) else MaterialTheme.colorScheme.primary) {
            Text(if (message.user) "Tu" else "N", Modifier.padding(horizontal = 10.dp, vertical = 9.dp), color = if (message.user) MaterialTheme.colorScheme.primary else Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            Card(colors = CardDefaults.cardColors(if (message.user) Color.White else Color(0xFFF1F5FA)), border = BorderStroke(1.dp, Color(0xFFE4E9F1))) {
                Column(Modifier.padding(13.dp)) {
                    Text(message.text, fontSize = 14.sp, lineHeight = 21.sp)
                    message.imageData?.let { data ->
                        val bitmap = remember(data) {
                            runCatching {
                                val bytes = android.util.Base64.decode(data.substringAfter(","), android.util.Base64.DEFAULT)
                                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                            }.getOrNull()
                        }
                        bitmap?.let { androidx.compose.foundation.Image(it, "Imagem criada", Modifier.fillMaxWidth()) }
                    }
                }
            }
            if (!message.user) {
                Row {
                    TextButton({ onCopy(message.text) }) { Text("Copiar") }
                    TextButton({ onSpeak(message.text) }) { Text("Ouvir") }
                }
            }
        }
    }
}

@Composable
private fun History(messages: List<ChatMessage>) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp)) {
        Text("Histórico", fontSize = 27.sp, fontWeight = FontWeight.Bold)
        Text("Mensagens desta sessão.", color = Color(0xFF6C7890), fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
        if (messages.isEmpty()) Text("Ainda não há mensagens.")
        messages.forEach {
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp), colors = CardDefaults.cardColors(Color.White)) {
                Column(Modifier.padding(14.dp)) {
                    Text(if (it.user) "Tu" else "Nexora AI", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                    Text(it.text, Modifier.padding(top = 5.dp), fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun Settings(credits: Int, online: Boolean, clear: () -> Unit, about: () -> Unit, privacy: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp)) {
        Text("Definições", fontSize = 27.sp, fontWeight = FontWeight.Bold)
        Text("Experiência e ligação do Nexora AI.", color = Color(0xFF6C7890), fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
        Card(Modifier.fillMaxWidth().padding(bottom = 10.dp), colors = CardDefaults.cardColors(Color.White)) {
            Column(Modifier.padding(15.dp)) {
                Text("Conta e créditos", fontWeight = FontWeight.Bold)
                Text(credits.toString() + " créditos disponíveis", color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 6.dp))
                Text("Plano Free · assinaturas entram depois", color = Color(0xFF6C7890), fontSize = 12.sp)
            }
        }
        Card(Modifier.fillMaxWidth().padding(bottom = 10.dp), colors = CardDefaults.cardColors(Color.White)) {
            Column(Modifier.padding(15.dp)) {
                Text("Ligação", fontWeight = FontWeight.Bold)
                Text(if (online) "Worker online" else "Sem ligação", color = if (online) Color(0xFF1B9A62) else Color(0xFFC64B4B), modifier = Modifier.padding(top = 6.dp))
            }
        }
        Button(about, Modifier.fillMaxWidth()) { Text("Sobre o Nexora AI") }
        Button(privacy, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Privacidade") }
        TextButton(clear, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Limpar conversa atual") }
    }
}

private fun displayName(context: Context, uri: Uri): String {
    context.contentResolver.query(uri, null, null, null, null)?.use {
        val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (it.moveToFirst() && index >= 0) return it.getString(index)
    }
    return uri.lastPathSegment ?: "ficheiro"
}

private fun readBytes(context: Context, uri: Uri): ByteArray {
    val input = context.contentResolver.openInputStream(uri) ?: error("Não foi possível ler o ficheiro.")
    input.use {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
            val count = it.read(buffer)
            if (count < 0) break
            total += count
            require(total <= 12 * 1024 * 1024) { "O ficheiro deve ter até 12 MB." }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}

private fun copy(context: Context, value: String) {
    val clipboard = context.getSystemService(ClipboardManager::class.java)
    clipboard.setPrimaryClip(ClipData.newPlainText("Nexora AI", value))
}

private fun speak(context: Context, api: NexoraApi, value: String) {
    Thread {
        try {
            val bytes = api.tts(value)
            val file = File(context.cacheDir, "voice.wav")
            file.writeBytes(bytes)
            val player = MediaPlayer()
            player.setDataSource(file.absolutePath)
            player.setOnPreparedListener { it.start() }
            player.setOnCompletionListener { it.release() }
            player.prepareAsync()
        } catch (_: Exception) {
        }
    }.start()
}

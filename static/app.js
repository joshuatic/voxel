const searchBox = document.getElementById("searchBox");
const searchButton = document.getElementById("searchButton");
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

let currentModels = [];
let currentVoices = [];
let selectedVoiceId = "male1-genam";

let currentLanguage = localStorage.getItem("voxel.language") || "en-US";
let translations = {};

let currentPhraseAudio = null;
let currentTtsAudio = null;

let isRecordingVoice = false;
let currentAudioStream = null;
let recordingAudioContext = null;
let recordingSource = null;
let recordingProcessor = null;
let recordedPcmChunks = [];
let recordingSampleRate = 16000;

let answerRenderMode = localStorage.getItem("voxel.answerRenderMode") || "markdown";
let lastAnswerText = "";

let voxelSettings = {
    autoSpeakOnSearch: false,
    autoSubmitVoiceCommand: true,
    showDebugPanel: true,
    preferOfflineMode: false
};

searchBox.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        askVoxel();
    }
});

window.addEventListener("load", async function () {
    renderIcons();
    loadSettingsFromStorage();
    applySettingsToUi();

    await loadLanguage();
    await checkHealth();
    await checkModel();
    await loadSuggestions();
    await loadRecentHistory();
    await loadVoices();
    await loadAudioInputs();
    await loadApiKeyStatus();
    await loadCacheStatus();
});

document.addEventListener("click", function (event) {
    const picker = document.querySelector(".model-picker");
    const menu = document.getElementById("modelMenu");

    if (!picker || !menu) {
        return;
    }

    if (!picker.contains(event.target)) {
        menu.classList.add("hidden");
    }
});

async function readJsonResponse(response) {
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            ok: false,
            error: text || "Server returned a non-JSON response.",
            status: response.status,
            statusText: response.statusText
        };
    }
}

const JSON_HEADERS = {
    "Content-Type": "application/json"
};

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    return readJsonResponse(response);
}

async function postJson(url, payload) {
    return fetchJson(url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload)
    });
}

async function postRequest(url, options = {}) {
    return fetchJson(url, {
        method: "POST",
        ...options
    });
}

async function loadCacheStatus() {
    try {
        const data = await fetchJson("/cache/status");

        if (!data.ok) {
            showToast(data.error || "Could not load cache status.");
            return;
        }

        renderCacheStatus(data);
    } catch (error) {
        console.warn("Could not load cache status:", error);
        showToast("Could not load cache status.");
    }
}

function renderCacheStatus(data) {
    const container = document.getElementById("cacheStatusList");

    if (!container) {
        return;
    }

    const caches = data.caches || [];

    if (!caches.length) {
        container.innerHTML = `<div class="empty">No caches found.</div>`;
        return;
    }

    container.innerHTML = "";

    for (const cache of caches) {
        const item = document.createElement("div");
        item.className = "cache-item";

        item.innerHTML = `
            <div>
                <strong>${escapeHtml(cache.name)}</strong>
                <small>${escapeHtml(cache.description)}</small>
                <small>${escapeHtml(cache.path)}</small>
            </div>

            <div class="cache-item-side">
                <span>${escapeHtml(cache.size)}</span>
                <button class="micro-button" onclick="clearVoxelCache('${escapeHtml(cache.id)}')">Clear</button>
            </div>
        `;

        container.appendChild(item);
    }

    const total = document.createElement("div");
    total.className = "cache-total";
    total.textContent = `Total cache size: ${data.total_size || "0 B"}`;

    container.appendChild(total);
}

async function clearVoxelCache(cacheId) {
    const label = cacheId === "all" ? "all safe caches" : `${cacheId} cache`;
    const confirmed = confirm(`Clear ${label}?`);

    if (!confirmed) {
        return;
    }

    try {
        const data = await postJson("/cache/clear", {
            cache_id: cacheId
        });

        if (!data.ok) {
            setDebug(data);
            showToast(data.error || "Could not clear cache.");
            return;
        }

        showToast("Cache cleared.");
        await loadCacheStatus();
    } catch (error) {
        console.warn("Could not clear cache:", error);
        showToast("Could not clear cache.");
    }
}

function setPrompt(value) {
    searchBox.value = value;
    searchBox.focus();
}

async function loadApiKeyStatus() {
    try {
        const data = await fetchJson("/api-keys/status");

        if (!data.ok) {
            return;
        }

        renderApiKeyStatus(data);
    } catch (error) {
        console.warn("Could not load API key status:", error);
    }
}

function renderApiKeyStatus(data) {
    const activeSelect = document.getElementById("activeProviderSelect");
    const secretBackendStatus = document.getElementById("secretBackendStatus");

    if (secretBackendStatus) {
        secretBackendStatus.textContent = `Secret backend: ${data.secret_backend || "unknown"}`;
    }

    if (activeSelect) {
        activeSelect.value = data.active_provider || "local";
    }

    const providers = data.providers || [];

    for (const provider of providers) {
        const status = document.getElementById(`${provider.id}KeyStatus`);

        if (!status) {
            continue;
        }

        if (provider.has_key) {
            status.textContent = `Saved: ${provider.masked_key}`;
        } else {
            status.textContent = "No key saved";
        }
    }
}

async function saveApiKey(providerId, inputId) {
    const input = document.getElementById(inputId);

    if (!input) {
        return;
    }

    const apiKey = input.value.trim();

    if (!apiKey) {
        showToast("Paste an API key first.");
        return;
    }

    try {
        const data = await postJson("/api-keys/set", {
            provider_id: providerId,
            api_key: apiKey
        });

        if (!data.ok) {
            showToast(data.error || "Could not save API key.");
            return;
        }

        input.value = "";
        renderApiKeyStatus(data);
        showToast("API key saved.");
    } catch (error) {
        console.warn("Could not save API key:", error);
        showToast("Could not save API key.");
    }
}

async function clearApiKey(providerId) {
    const confirmed = confirm(`Clear ${providerId} API key?`);

    if (!confirmed) {
        return;
    }

    try {
        const data = await postJson("/api-keys/clear", {
            provider_id: providerId
        });

        if (!data.ok) {
            showToast(data.error || "Could not clear API key.");
            return;
        }

        renderApiKeyStatus(data);
        showToast("API key cleared.");
    } catch (error) {
        console.warn("Could not clear API key:", error);
        showToast("Could not clear API key.");
    }
}

async function saveActiveProvider() {
    const select = document.getElementById("activeProviderSelect");

    if (!select) {
        return;
    }

    try {
        const data = await postJson("/api-keys/active", {
            provider_id: select.value
        });

        if (!data.ok) {
            showToast(data.error || "Could not set provider.");
            return;
        }

        renderApiKeyStatus(data);
        showToast(`Provider: ${select.value}`);
    } catch (error) {
        console.warn("Could not set active provider:", error);
        showToast("Could not set provider.");
    }
}

async function loadLanguage(languageCode = currentLanguage) {
    try {
        const response = await fetch(`/static/i18n/${languageCode}.json`);
        translations = await readJsonResponse(response);

        if (translations.ok === false) {
            new Error(translations.error);
        }

        currentLanguage = languageCode;
        localStorage.setItem("voxel.language", languageCode);

        applyTranslations();
    } catch (error) {
        console.warn("Could not load language:", error);

        if (languageCode !== "en-US") {
            await loadLanguage("en-US");
        }
    }
}

function t(key, fallback = key) {
    return translations[key] || fallback;
}

function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        const key = element.getAttribute("data-i18n");
        element.textContent = t(key, element.textContent);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        const key = element.getAttribute("data-i18n-placeholder");
        element.setAttribute("placeholder", t(key, element.getAttribute("placeholder")));
    });
}

async function setLanguage(languageCode) {
    await loadLanguage(languageCode);
    showToast(`Language: ${languageCode}`);
}

async function checkHealth() {
    try {
        const data = await fetchJson("/health");

        document.getElementById("statusOutput").textContent =
            JSON.stringify(data, null, 2);

        if (data.ok) {
            setServerStatus(true, `${data.name} ${data.version}`);

            const urlPill = document.getElementById("urlPill");
            if (urlPill && data.url) {
                urlPill.textContent = `Localhost: ${data.url}`;
            }
            showToast("Server online.");
        } else {
            setServerStatus(false, "Server issue");
        }
    } catch (error) {
        setServerStatus(false, "Offline");
        showToast("Could not reach server.");
    }
}

async function checkModel() {
    try {
        const data = await fetchJson("/model/status");

        document.getElementById("statusOutput").textContent =
            JSON.stringify(data, null, 2);

        if (!data.ok) {
            setModelStatus(false, null);
            showToast(data.error || "Could not check model.");
            return;
        }

        const modelFound = Boolean(data["model_found"]);

        setModelStatus(modelFound, data);
        populateModelPicker(data);

        showToast(modelFound ? "Model found." : "Model missing.");
    } catch (error) {
        setModelStatus(false, null);
        showToast("Could not check model.");
    }
}

async function loadPersonality() {
    try {
        const data = await fetchJson("/personality");

        if (!data.ok) {
            showToast(data.error || "Could not load personality.");
            return;
        }

        const input = document.getElementById("personalityInput");

        if (input) {
            input.value = data.personality || "";
        }
    } catch (error) {
        console.warn("Could not load personality:", error);
        showToast("Could not load personality.");
    }
}

async function savePersonality() {
    const input = document.getElementById("personalityInput");

    if (!input) {
        return;
    }

    try {
        const data = await postJson("/personality", {
            personality: input.value
        });

        if (!data.ok) {
            showToast(data.error || "Could not save personality.");
            return;
        }

        input.value = data.personality || input.value;
        showToast("Personality saved.");
    } catch (error) {
        console.warn("Could not save personality:", error);
        showToast("Could not save personality.");
    }
}

async function resetPersonality() {
    const confirmed = confirm("Reset Voxel personality?");

    if (!confirmed) {
        return;
    }

    try {
        const data = await postRequest("/personality/reset");

        if (!data.ok) {
            showToast(data.error || "Could not reset personality.");
            return;
        }

        const input = document.getElementById("personalityInput");

        if (input) {
            input.value = data.personality || "";
        }

        showToast("Personality reset.");
    } catch (error) {
        console.warn("Could not reset personality:", error);
        showToast("Could not reset personality.");
    }
}

async function loadSuggestions() {
    try {
        const data = await fetchJson("/suggestions");

        if (!data.ok) {
            return;
        }

        renderSuggestions(data.suggestions || []);
    } catch (error) {
        console.warn("Could not load suggestions:", error);
    }
}

function renderSuggestions(suggestions) {
    const container = document.getElementById("quickPrompts");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    for (const suggestion of suggestions) {
        const chip = document.createElement("span");
        chip.className = "prompt-chip";
        chip.textContent = suggestion;
        chip.onclick = () => setPrompt(suggestion);

        container.appendChild(chip);
    }
}

async function loadRecentHistory() {
    try {
        const data = await fetchJson("/history/recent");

        if (!data.ok) {
            return;
        }

        renderHistory(data.searches || []);
    } catch (error) {
        console.warn("Could not load history:", error);
    }
}

function renderHistory(searches) {
    const container = document.getElementById("historyOutput");

    if (!container) {
        return;
    }

    if (!searches.length) {
        container.innerHTML = `<div class="empty">No search history yet.</div>`;
        return;
    }

    container.innerHTML = "";

    for (const search of searches) {
        const div = document.createElement("div");
        div.className = "history-item";
        div.onclick = () => setPrompt(search.query);

        div.innerHTML = `
            <strong>${escapeHtml(search.query)}</strong>
            <small>${escapeHtml(search.created_at)} · ${search.source_count} sources · ${search.elapsed_ms}ms</small>
        `;

        container.appendChild(div);
    }
}

async function clearHistory() {
    const confirmed = confirm("Clear recent searches?");

    if (!confirmed) {
        return;
    }

    try {
        const data = await postRequest("/history/clear");

        if (!data.ok) {
            showToast(data.error || "Could not clear history.");
            return;
        }

        showToast("History cleared.");
        await loadRecentHistory();
        await loadSuggestions();
    } catch (error) {
        console.warn("Could not clear history:", error);
        showToast("Could not clear history.");
    }
}

async function loadVoices() {
    try {
        const data = await fetchJson("/voice/list");

        if (!data.ok) {
            return;
        }

        currentVoices = data.voices || [];
        selectedVoiceId = data.selected_voice_id || "male1-genam";

        renderVoicePicker();
    } catch (error) {
        console.warn("Could not load voices:", error);
    }
}

function describeVoice(voice) {
    if (voice.type === "piper") {
        return "Piper TTS · speaks full answers";
    }

    if (Number(voice.phrase_count || 0) > 0) {
        return `${voice.phrase_count} phrases`;
    }

    return voice.type || "voice";
}

function renderVoicePicker() {
    const select = document.getElementById("voiceSelect");

    if (!select) {
        return;
    }

    select.innerHTML = "";

    if (!currentVoices.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No voices found";
        select.appendChild(option);
        return;
    }

    for (const voice of currentVoices) {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = `${voice.display_name} — ${describeVoice(voice)}`;

        if (voice.id === selectedVoiceId) {
            option.selected = true;
        }

        select.appendChild(option);
    }
}

async function selectVoice(voiceId) {
    try {
        const data = await postRequest(`/voice/select?voice_id=${encodeURIComponent(voiceId)}`);

        if (!data.ok) {
            showToast(data.error || "Could not select voice.");
            return;
        }

        selectedVoiceId = data.selected_voice_id;
        showToast(`Selected voice: ${selectedVoiceId}`);
        await loadVoices();
    } catch (error) {
        console.warn("Could not select voice:", error);
        showToast("Could not select voice.");
    }
}

async function importVoiceZip() {
    const input = document.getElementById("voiceZipInput");

    if (!input || !input.files || input.files.length === 0) {
        showToast("Choose a voice ZIP first.");
        return;
    }

    const file = input.files[0];

    if (!file.name.toLowerCase().endsWith(".zip")) {
        showToast("Voice pack must be a .zip file.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        showToast("Importing voice...");

        const response = await fetch("/voice/import", {
            method: "POST",
            body: formData
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            setDebug(data);
            showToast(data.error || "Voice import failed.");
            return;
        }

        showToast(`Imported: ${data.display_name || data.voice_id}`);

        input.value = "";

        await loadVoices();

        if (data.voice_id) {
            await selectVoice(data.voice_id);
        }
    } catch (error) {
        console.error(error);
        showToast("Voice import failed.");
    }
}

function getSelectedVoice() {
    return currentVoices.find(voice => voice.id === selectedVoiceId) || null;
}

async function playVoicePhrase(phraseId, voiceId = "selected") {
    stopVoicePhrase();

    const selectedVoice = getSelectedVoice();

    if (!selectedVoice) {
        return;
    }

    const phraseCount = Number(selectedVoice.phrase_count || 0);

    if (selectedVoice.type === "piper" && phraseCount <= 0) {
        return;
    }

    if (phraseCount > 0) {
        await playRecordedPhrase(phraseId, voiceId);
    }
}

async function playRecordedPhrase(phraseId, voiceId = "selected") {
    try {
        const response = await fetch(
            `/voice/phrase?voice_id=${encodeURIComponent(voiceId)}&phrase_id=${encodeURIComponent(phraseId)}`
        );

        if (!response.ok) {
            console.warn(`Missing voice phrase: ${phraseId}`);
            return;
        }

        const blob = await response.blob();
        await playAudioBlob(blob, phraseId, "phrase");
    } catch (error) {
        console.warn("Voice phrase playback failed:", error);
    }
}

async function playAudioBlob(blob, label, kind = "phrase") {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);

    if (kind === "tts") {
        currentTtsAudio = audio;
    } else {
        currentPhraseAudio = audio;
    }

    audio.onplay = function () {
        setVoiceActive(true, label);
    };

    audio.onended = function () {
        setVoiceActive(false, "Voice idle");
        URL.revokeObjectURL(audioUrl);

        if (kind === "tts") {
            currentTtsAudio = null;
        } else {
            currentPhraseAudio = null;
        }
    };

    audio.onerror = function () {
        setVoiceActive(false, "Voice error");
        URL.revokeObjectURL(audioUrl);

        if (kind === "tts") {
            currentTtsAudio = null;
        } else {
            currentPhraseAudio = null;
        }

        showToast("Audio playback failed.");
    };

    await audio.play();
}

function stopVoicePhrase() {
    if (currentPhraseAudio) {
        currentPhraseAudio.pause();
        currentPhraseAudio.currentTime = 0;
        currentPhraseAudio = null;
    }

    setVoiceActive(false, "Voice idle");
}

function stopSpeaking() {
    if (currentTtsAudio) {
        currentTtsAudio.pause();
        currentTtsAudio.currentTime = 0;
        currentTtsAudio = null;
    }

    if (currentPhraseAudio) {
        currentPhraseAudio.pause();
        currentPhraseAudio.currentTime = 0;
        currentPhraseAudio = null;
    }

    setVoiceActive(false, "Voice idle");
}

function cleanTextForSpeech(text) {
    return String(text)
        // Remove citation tags like [1], [2], [3]
        .replace(/\s*\[\d+]/g, "")

        // Remove repeated whitespace
        .replace(/[ \t]+/g, " ")

        // Make line breaks speak more naturally
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")

        // Clean spacing before punctuation
        .replace(/\s+([,.!?;:])/g, "$1")

        .trim();
}

async function speakCurrentAnswer() {
    const answer = lastAnswerText.trim();

    if (
        !answer ||
        answer === "Ask anything..." ||
        answer === "Searching..." ||
        answer === "Ask something and Voxel will cook."
    ) {
        showToast("No answer to speak yet.");
        return;
    }

    stopSpeaking();

    try {
        setVoiceActive(true, "Generating voice...");

        const response = await fetch("/voice/speak", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: cleanTextForSpeech(answer),
                voice_id: "selected"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            new Error(errorText);
        }

        const blob = await response.blob();
        await playAudioBlob(blob, "Speaking", "tts");
    } catch (error) {
        console.error(error);
        setVoiceActive(false, "Voice error");
        showToast("TTS failed.");
    }
}

/* ============================================================
   Voice input
   Uses Web Audio API and uploads clean WAV instead of WebM.
   This avoids most Whisper decode problems on Windows.
   ============================================================ */

async function loadAudioInputs() {
    const select = document.getElementById("audioInputSelect");

    if (!select) {
        return;
    }

    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === "audioinput");

        const savedDeviceId = localStorage.getItem("voxel.audioInputDeviceId") || "";

        select.innerHTML = "";

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "System default microphone";
        select.appendChild(defaultOption);

        for (const device of audioInputs) {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${select.length}`;

            if (device.deviceId === savedDeviceId) {
                option.selected = true;
            }

            select.appendChild(option);
        }

        select.onchange = function () {
            localStorage.setItem("voxel.audioInputDeviceId", select.value);
        };
    } catch (error) {
        console.warn("Could not load audio inputs:", error);
        select.innerHTML = `<option value="">Microphone permission needed</option>`;
    }
}

async function toggleVoiceInput() {
    if (isRecordingVoice) {
        await stopVoiceInput();
        return;
    }

    await startVoiceInput();
}

async function startVoiceInput() {
    try {
        const selectedDeviceId = localStorage.getItem("voxel.audioInputDeviceId") || "";

        const audioConstraints = selectedDeviceId
            ? {
                deviceId: { exact: selectedDeviceId },
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
            : {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };

        currentAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
        });

        recordingAudioContext = new AudioContext({
            sampleRate: 16000
        });

        recordingSampleRate = recordingAudioContext.sampleRate;
        recordedPcmChunks = [];

        recordingSource = recordingAudioContext.createMediaStreamSource(currentAudioStream);
        recordingProcessor = recordingAudioContext.createScriptProcessor(4096, 1, 1);

        recordingProcessor.onaudioprocess = function (event) {
            if (!isRecordingVoice) {
                return;
            }

            const input = event.inputBuffer.getChannelData(0);
            recordedPcmChunks.push(new Float32Array(input));
        };

        recordingSource.connect(recordingProcessor);
        recordingProcessor.connect(recordingAudioContext.destination);

        isRecordingVoice = true;
        setMicButtonState(true);
        showToast("Listening...");
    } catch (error) {
        console.error(error);
        await cleanupVoiceRecording();
        showToast("Microphone unavailable.");
    }
}

async function stopVoiceInput() {
    if (!isRecordingVoice) {
        setMicButtonState(false);
        return;
    }

    isRecordingVoice = false;
    setMicButtonState(false);
    showToast("Transcribing...");

    const wavBlob = encodeRecordedAudioToWav();

    await cleanupVoiceRecording();

    if (!wavBlob || wavBlob.size <= 44) {
        showToast("No audio recorded.");
        return;
    }

    await transcribeRecordedAudio(wavBlob);
}

async function cleanupVoiceRecording() {
    try {
        if (recordingProcessor) {
            recordingProcessor.disconnect();
            recordingProcessor.onaudioprocess = null;
        }

        if (recordingSource) {
            recordingSource.disconnect();
        }

        if (recordingAudioContext) {
            await recordingAudioContext.close();
        }
    } catch (error) {
        console.warn("Audio cleanup warning:", error);
    }

    if (currentAudioStream) {
        currentAudioStream.getTracks().forEach(track => track.stop());
    }

    recordingProcessor = null;
    recordingSource = null;
    recordingAudioContext = null;
    currentAudioStream = null;
}

function encodeRecordedAudioToWav() {
    const samples = mergeFloat32Chunks(recordedPcmChunks);

    if (!samples.length) {
        return null;
    }

    const wavBuffer = encodeWav16BitMono(samples, recordingSampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
}

function mergeFloat32Chunks(chunks) {
    let totalLength = 0;

    for (const chunk of chunks) {
        totalLength += chunk.length;
    }

    const result = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

function encodeWav16BitMono(samples, sampleRate) {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");

    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);

    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;

    for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

        view.setInt16(offset, intSample, true);
        offset += 2;
    }

    return buffer;
}

function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}

function loadSettingsFromStorage() {
    const saved = localStorage.getItem("voxel.settings");

    if (!saved) {
        return;
    }

    try {
        voxelSettings = {
            ...voxelSettings,
            ...JSON.parse(saved)
        };
    } catch (error) {
        console.warn("Could not load Voxel settings:", error);
    }
}

function saveSettingsToStorage() {
    localStorage.setItem("voxel.settings", JSON.stringify(voxelSettings));
}

function applySettingsToUi() {
    setChecked("autoSpeakToggle", voxelSettings.autoSpeakOnSearch);
    setChecked("autoSubmitVoiceToggle", voxelSettings.autoSubmitVoiceCommand);
    setChecked("showDebugToggle", voxelSettings.showDebugPanel);
    setChecked("preferOfflineToggle", voxelSettings.preferOfflineMode);

    const debugDetails = document.getElementById("debugOutput")?.closest("details");

    if (debugDetails) {
        debugDetails.style.display = voxelSettings.showDebugPanel ? "" : "none";
    }
}

function saveSettingsFromUi() {
    voxelSettings.autoSpeakOnSearch = getChecked("autoSpeakToggle");
    voxelSettings.autoSubmitVoiceCommand = getChecked("autoSubmitVoiceToggle");
    voxelSettings.showDebugPanel = getChecked("showDebugToggle");
    voxelSettings.preferOfflineMode = getChecked("preferOfflineToggle");

    saveSettingsToStorage();
    applySettingsToUi();
    showToast("Settings saved.");
}

function setChecked(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.checked = Boolean(value);
    }
}

function getChecked(id) {
    const element = document.getElementById(id);
    return element ? Boolean(element.checked) : false;
}

function openSettingsModal() {
    const backdrop = document.getElementById("settingsBackdrop");

    if (!backdrop) {
        return;
    }

    applySettingsToUi();
    backdrop.classList.remove("hidden");
}

function closeSettingsModal() {
    const backdrop = document.getElementById("settingsBackdrop");

    if (!backdrop) {
        return;
    }

    backdrop.classList.add("hidden");
}

function closeSettingsModalFromBackdrop(event) {
    if (event.target && event.target.id === "settingsBackdrop") {
        closeSettingsModal();
    }
}

async function transcribeRecordedAudio(wavBlob) {
    try {
        const formData = new FormData();
        formData.append("file", wavBlob, "voice-command.wav");

        const response = await fetch("/voice/transcribe", {
            method: "POST",
            body: formData
        });

        const data = await readJsonResponse(response);
        setDebug(data);

        if (!data.ok) {
            showToast(data.error || "Could not transcribe audio.");
            return;
        }

        const transcript = (data.text || "").trim();

        if (!transcript) {
            showToast("No speech detected.");
            return;
        }

        const cleanedCommand = cleanVoiceCommand(transcript);

        searchBox.value = cleanedCommand;
        showToast(`Heard: ${cleanedCommand}`);

        if (voxelSettings.autoSubmitVoiceCommand) {
            await askVoxel();
        }
    } catch (error) {
        console.error(error);
        showToast("Transcription failed.");
    }
}

function cleanVoiceCommand(text) {
    let cleaned = text.trim();
    const lowered = cleaned.toLowerCase();

    const prefixes = [
        "voxel,",
        "voxel",
        "hey voxel,",
        "hey voxel",
        "okay voxel,",
        "okay voxel"
    ];

    for (const prefix of prefixes) {
        if (lowered.startsWith(prefix)) {
            cleaned = cleaned.slice(prefix.length).trim();
            break;
        }
    }

    return cleaned.replace(/^[,.\s]+/, "").trim();
}

function setMicButtonState(active) {
    const micButton = document.getElementById("micButton");

    if (!micButton) {
        return;
    }

    micButton.classList.toggle("recording", active);
    micButton.title = active ? "Stop recording" : "Push to talk";
}

/* ============================================================
   Command/search flow
   ============================================================ */

async function askVoxel() {
    const text = searchBox.value.trim();

    if (!text) {
        showToast("Type a question first.");
        return;
    }

    setLoading(true, "Searching the web...");
    setAnswer("Searching...");
    setSources([]);
    setDebug(null);
    setMeta("Working", "0 sources");

    playVoicePhrase("searching");

    const startedAt = performance.now();

    const readingTimer = setTimeout(() => {
        if (loader.classList.contains("active")) {
            loaderText.textContent = "Reading sources...";
            playVoicePhrase("reading");
        }
    }, 700);

    const thinkingTimer = setTimeout(() => {
        if (loader.classList.contains("active")) {
            loaderText.textContent = "Thinking locally...";
            playVoicePhrase("thinking");
        }
    }, 1500);

    try {
        const response = await fetch(`/command?text=${encodeURIComponent(text)}`, {
            method: "POST"
        });

        const data = await readJsonResponse(response);
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(2);

        setDebug(data);

        if (!data.ok) {
            setAnswer(data.error || data.answer || "Voxel failed.");
            setSources([]);
            setMeta(`Failed in ${elapsed}s`, "0 sources");
            showToast("Search failed.");
            playVoicePhrase("error");
            return;
        }

        if (data.mode === "offline-local") {
            setAnswer(`[Offline/local mode]\n\n${data.answer || "Voxel returned no answer."}`);
        } else {
            setAnswer(data.answer || "Voxel returned no answer.");
        }

        setSources(data.sources || []);
        setMeta(`${data.mode || "Done"} · ${elapsed}s`, `${(data.sources || []).length} sources`);

        if (data.debug && data.debug.model) {
            setModelStatus(Boolean(data.debug.model.model_found), data.debug.model);
            populateModelPicker(data.debug.model);
        }

        showToast("Voxel answered.");
        playVoicePhrase("complete");
        if (voxelSettings.autoSpeakOnSearch) {
            await speakCurrentAnswer();
        }

        await checkModel();
        await loadSuggestions();
        await loadRecentHistory();
    } catch (error) {
        setAnswer(
            "Voxel could not reach the local backend.\n\n" +
            "Check that the server is still running.\n\n" +
            `Details: ${error}`
        );

        setSources([]);
        setMeta("Failed", "0 sources");
        showToast("Request failed.");
        playVoicePhrase("error");
    } finally {
        clearTimeout(readingTimer);
        clearTimeout(thinkingTimer);
        setLoading(false, "");
    }
}

function setServerStatus(isOnline, label) {
    const dot = document.getElementById("serverDot");
    const pill = document.getElementById("serverPill");
    const status = document.getElementById("serverStatus");
    const badge = document.getElementById("serverBadge");

    dot.className = isOnline ? "dot good" : "dot warning";
    pill.textContent = isOnline ? "Server online" : "Server offline";
    status.textContent = label;
    badge.textContent = isOnline ? "Online" : "Offline";
}

function setModelStatus(found, data) {
    const dot = document.getElementById("modelDot");
    const pill = document.getElementById("modelPill");
    const status = document.getElementById("modelStatus");
    const badge = document.getElementById("modelBadge");
    const loaded = document.getElementById("loadedStatus");

    const isLoaded = data ? Boolean(data.loaded) : false;

    dot.className = found ? "dot good" : "dot warning";
    pill.textContent = found ? "Model found" : "Model missing";
    status.textContent = found ? "Ready" : "Missing";
    badge.textContent = found ? "Ready" : "Missing";

    loaded.textContent = isLoaded ? "Yes" : "No";

    const loadedPill = loaded.parentElement.parentElement.querySelector(".pill");
    if (loadedPill) {
        loadedPill.textContent = isLoaded ? "Loaded" : "GGUF";
    }
}

function populateModelPicker(data) {
    const buttonText = document.getElementById("modelPickerText");
    const menu = document.getElementById("modelMenu");

    if (!buttonText || !menu || !data || !data.available_models) {
        return;
    }

    currentModels = data.available_models;

    const selected = data.selected_model || "auto";
    buttonText.textContent = compactModelName(selected);

    menu.innerHTML = "";

    const autoButton = document.createElement("button");
    autoButton.className = "model-option";
    autoButton.onclick = () => selectModelByName("auto");
    autoButton.innerHTML = `
        <span>Auto</span>
        <small>Pick first GGUF model</small>
    `;
    menu.appendChild(autoButton);

    for (const model of currentModels) {
        const button = document.createElement("button");
        button.className = "model-option";
        button.onclick = () => selectModelByName(model.name);

        button.innerHTML = `
            <span>${escapeHtml(compactModelName(model.name))}</span>
            <small>${escapeHtml(model.name)} · ${model.size_mb} MB</small>
        `;

        menu.appendChild(button);
    }
}

function toggleModelMenu() {
    const menu = document.getElementById("modelMenu");
    menu.classList.toggle("hidden");
}

async function selectModelByName(selectedName) {
    const menu = document.getElementById("modelMenu");
    menu.classList.add("hidden");

    try {
        const response = await fetch(`/model/select?name=${encodeURIComponent(selectedName)}`, {
            method: "POST"
        });

        const data = await readJsonResponse(response);

        document.getElementById("statusOutput").textContent =
            JSON.stringify(data, null, 2);

        if (data.ok) {
            showToast(`Selected model: ${compactModelName(selectedName)}`);
            await checkModel();
        } else {
            showToast(data.message || "Could not select model.");
        }
    } catch (error) {
        console.warn("Could not select model:", error);
        showToast("Could not select model.");
    }
}

function compactModelName(name) {
    if (!name || name === "auto") {
        return "Auto";
    }

    return name
        .replace(".gguf", "")
        .replace("Qwen2.5-", "Qwen ")
        .replace("qwen2.5-", "Qwen ")
        .replace("-Instruct", "")
        .replace("-instruct", "")
        .replace("-Q4_K_M", " Q4")
        .replace("-q4_k_m", " Q4")
        .replaceAll("_", " ");
}

function setLoading(active, text) {
    loader.classList.toggle("active", active);
    loaderText.textContent = text;
    searchButton.disabled = active;
    searchButton.textContent = active ? "Working..." : "Search";
}

function setAnswer(text) {
    lastAnswerText = String(text || "");

    const output = document.getElementById("answerOutput");

    if (!output) {
        return;
    }

    if (answerRenderMode === "raw") {
        output.textContent = lastAnswerText;
        output.classList.add("raw-text");
        return;
    }

    output.classList.remove("raw-text");
    output.innerHTML = renderSafeMarkdown(lastAnswerText);
}

function setMeta(answerMeta, sourcesMeta) {
    document.getElementById("answerMeta").textContent = answerMeta;
    document.getElementById("sourcesMeta").textContent = sourcesMeta;
}

function setSources(sources) {
    const sourcesOutput = document.getElementById("sourcesOutput");
    sourcesOutput.innerHTML = "";

    if (!sources || sources.length === 0) {
        sourcesOutput.innerHTML = `<div class="empty">No sources.</div>`;
        return;
    }

    const grid = document.createElement("div");
    grid.className = "sources-grid";

    sources.forEach((source, index) => {
        const div = document.createElement("div");
        div.className = "source";

        const title = escapeHtml(source.title || "Untitled");
        const url = escapeHtml(source.url || "");
        const snippet = escapeHtml(source.snippet || "No snippet available.");

        div.innerHTML = `
            <div class="source-top">
                <div class="source-number">${index + 1}</div>

                <div>
                    <a class="source-title" href="${url}" target="_blank" rel="noreferrer">
                        ${title}
                    </a>

                    <div class="source-url">${url}</div>
                </div>
            </div>

            <p class="source-snippet">${snippet}</p>
        `;

        grid.appendChild(div);
    });

    sourcesOutput.appendChild(grid);
}

function setDebug(data) {
    const debugOutput = document.getElementById("debugOutput");
    debugOutput.textContent = data ? JSON.stringify(data, null, 2) : "No request yet.";
}

function setVoiceActive(active, label) {
    const equalizer = document.getElementById("equalizer");
    const voiceStatus = document.getElementById("voiceStatus");

    if (equalizer) {
        equalizer.classList.toggle("speaking", active);
    }

    if (voiceStatus) {
        voiceStatus.textContent = label;
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.__voxelToastTimer);

    window.__voxelToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 1800);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderIcons() {
    const icons = {
        mic: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"></path>
                <path d="M19 11a7 7 0 0 1-14 0"></path>
                <path d="M12 18v4"></path>
                <path d="M8 22h8"></path>
            </svg>
        `,
        volume: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z"></path>
                <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
                <path d="M18.5 5.5a9 9 0 0 1 0 13"></path>
            </svg>
        `,
        stop: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
            </svg>
        `,
        settings: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"></path>
            <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04A1.8 1.8 0 0 0 14.8 19.6a1.8 1.8 0 0 0-1.05 1.65V21.4a2.1 2.1 0 0 1-4.2 0v-.15A1.8 1.8 0 0 0 8.5 19.6a1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.9 15a1.8 1.8 0 0 0-1.65-1.05H2.1a2.1 2.1 0 0 1 0-4.2h.15A1.8 1.8 0 0 0 3.9 8.7a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 8.5 4.1a1.8 1.8 0 0 0 1.05-1.65V2.3a2.1 2.1 0 0 1 4.2 0v.15A1.8 1.8 0 0 0 14.8 4.1a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04A1.8 1.8 0 0 0 19.4 8.7a1.8 1.8 0 0 0 1.65 1.05h.15a2.1 2.1 0 0 1 0 4.2h-.15A1.8 1.8 0 0 0 19.4 15Z"></path>
        </svg>
        `,
    x: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
        </svg>
        `
    };

    document.querySelectorAll("[data-icon]").forEach((element) => {
        const iconName = element.getAttribute("data-icon");
        element.innerHTML = icons[iconName] || "";
    });
}

function setAnswerRenderMode(mode) {
    answerRenderMode = mode === "raw" ? "raw" : "markdown";
    localStorage.setItem("voxel.answerRenderMode", answerRenderMode);

    updateAnswerModeButtons();
    setAnswer(lastAnswerText);
}

function updateAnswerModeButtons() {
    const markdownButton = document.getElementById("markdownModeButton");
    const rawButton = document.getElementById("rawModeButton");

    if (markdownButton) {
        markdownButton.classList.toggle("selected", answerRenderMode === "markdown");
    }

    if (rawButton) {
        rawButton.classList.toggle("selected", answerRenderMode === "raw");
    }
}

function renderSafeMarkdown(markdown) {
    let text = escapeHtml(markdown);

    const codeBlocks = [];

    text = text.replace(/```([\s\S]*?)```/g, function (_, code) {
        const index = codeBlocks.length;
        codeBlocks.push(`<pre class="md-code-block"><code>${code.trim()}</code></pre>`);
        return `@@CODE_BLOCK_${index}@@`;
    });

    text = text
        // Headings
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")

        // Bold / italic
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")

        // Inline code
        .replace(/`([^`]+)`/g, "<code class=\"md-inline-code\">$1</code>")

        // Links
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>")

        // Simple unordered lists
        .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")

        // Paragraph-ish line breaks
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, "<br>");

    text = `<p>${text}</p>`;

    text = text.replace(/(<li>.*?<\/li>)(<br>)?/gs, "$1");
    text = text.replace(/(<li>[\s\S]*<\/li>)/g, "<ul>$1</ul>");

    for (let i = 0; i < codeBlocks.length; i++) {
        text = text.replace(`@@CODE_BLOCK_${i}@@`, codeBlocks[i]);
    }

    return text;
}
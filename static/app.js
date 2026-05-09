const searchBox = document.getElementById("searchBox");
const searchButton = document.getElementById("searchButton");
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

let currentModels = [];
let currentVoices = [];
let selectedVoiceId = "male1-genam";

let setupCurrentStep = 1;
let setupTotalSteps = 5;
let setupStatus = null;

let currentLanguage = localStorage.getItem("voxel.language") || "en-US";
let translations = {};

let currentPhraseAudio = null;
let currentTtsAudio = null;
let isSpeakingAnswer = false;

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

let lowResourceMode = false;

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
    await loadSetupStatus();
    await loadLowResourceMode();
    await loadMemories();
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

async function loadSetupStatus() {
    try {
        const response = await fetch("/setup/status");
        const data = await readJsonResponse(response);

        if (!data.ok) {
            console.warn("Could not load setup status:", data);
            return;
        }

        setupStatus = data;

        populateSetupChecks(data);
        populateSetupVoiceSelect(data);

        if (!data.setup_complete) {
            openInitialSetup();
        }
    } catch (error) {
        console.warn("Could not load setup status:", error);
    }
}

function openInitialSetup() {
    setupCurrentStep = 1;
    updateSetupStep();

    const backdrop = document.getElementById("setupBackdrop");

    if (backdrop) {
        backdrop.classList.remove("hidden");
    }
}

function closeInitialSetup() {
    const backdrop = document.getElementById("setupBackdrop");

    if (backdrop) {
        backdrop.classList.add("hidden");
    }
}

let currentMemories = [];
let currentMemorySearchQuery = "";

async function loadMemories() {
    try {
        currentMemorySearchQuery = "";

        const response = await fetch("/memory/list?include_disabled=true&limit=100");
        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not load memories.");
            return;
        }

        currentMemories = data.memories || [];
        renderMemoryList(currentMemories);
        setMemorySearchStatus(`Showing all memories. ${currentMemories.length} item(s).`);
    } catch (error) {
        console.warn("Could not load memories:", error);
        showToast("Could not load memories.");
    }
}

async function refreshMemoryView() {
    if (currentMemorySearchQuery) {
        const searchInput = document.getElementById("memorySearchInput");

        if (searchInput) {
            searchInput.value = currentMemorySearchQuery;
        }

        await searchMemoriesFromUi();
        return;
    }

    await loadMemories();
}

async function createMemoryFromUi() {
    const contentInput = document.getElementById("memoryContentInput");
    const typeInput = document.getElementById("memoryTypeInput");

    if (!contentInput) {
        return;
    }

    const content = contentInput.value.trim();
    const memoryType = typeInput && typeInput.value.trim()
        ? typeInput.value.trim()
        : "note";

    if (!content) {
        showToast("Type a memory first.");
        return;
    }

    try {
        const response = await fetch("/memory/create", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                content: content,
                memory_type: memoryType,
                source: "user",
                enabled: true
            })
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not create memory.");
            return;
        }

        contentInput.value = "";
        showToast("Memory added.");
        await refreshMemoryView();
    } catch (error) {
        console.warn("Could not create memory:", error);
        showToast("Could not create memory.");
    }
}

async function searchMemoriesFromUi() {
    const searchInput = document.getElementById("memorySearchInput");

    if (!searchInput) {
        return;
    }

    const query = searchInput.value.trim();

    if (!query) {
        await loadMemories();
        return;
    }

    try {
        currentMemorySearchQuery = query;

        const response = await fetch("/memory/search", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                query: query,
                include_disabled: true,
                limit: 100
            })
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not search memories.");
            return;
        }

        currentMemories = data.memories || [];
        renderMemoryList(currentMemories, query);

        setMemorySearchStatus(`Search: "${query}" · ${currentMemories.length} result(s).`);
        showToast(`Found ${currentMemories.length} memory item(s).`);
    } catch (error) {
        console.warn("Could not search memories:", error);
        showToast("Could not search memories.");
    }
}

function clearMemorySearch() {
    const searchInput = document.getElementById("memorySearchInput");

    if (searchInput) {
        searchInput.value = "";
    }

    currentMemorySearchQuery = "";
    loadMemories();
}

function handleMemorySearchKey(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        searchMemoriesFromUi();
    }
}

function setMemorySearchStatus(message) {
    const status = document.getElementById("memorySearchStatus");

    if (status) {
        status.textContent = message;
    }
}

async function setMemoryEnabledFromUi(memoryId, enabled) {
    try {
        const response = await fetch("/memory/enabled", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                memory_id: Number(memoryId),
                enabled: Boolean(enabled)
            })
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not update memory.");
            return;
        }

        showToast(enabled ? "Memory enabled." : "Memory disabled.");
        await refreshMemoryView();
    } catch (error) {
        console.warn("Could not update memory:", error);
        showToast("Could not update memory.");
    }
}

async function deleteMemoryFromUi(memoryId) {
    const confirmed = confirm(`Delete memory #${memoryId}?`);

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/memory/delete", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                memory_id: Number(memoryId)
            })
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not delete memory.");
            return;
        }

        showToast("Memory deleted.");
        await refreshMemoryView();
    } catch (error) {
        console.warn("Could not delete memory:", error);
        showToast("Could not delete memory.");
    }
}

async function clearAllMemoriesFromUi() {
    const confirmed = confirm("Clear all memories? This cannot be undone.");

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/memory/clear", {
            method: "POST"
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not clear memories.");
            return;
        }

        currentMemorySearchQuery = "";

        const searchInput = document.getElementById("memorySearchInput");

        if (searchInput) {
            searchInput.value = "";
        }

        showToast(`Cleared ${data.deleted_count || 0} memory item(s).`);
        await loadMemories();
    } catch (error) {
        console.warn("Could not clear memories:", error);
        showToast("Could not clear memories.");
    }
}

function renderMemoryList(memories, highlightQuery = "") {
    const container = document.getElementById("memoryList");

    if (!container) {
        return;
    }

    if (!memories || memories.length === 0) {
        container.innerHTML = `<div class="empty">No memories found.</div>`;
        return;
    }

    container.innerHTML = "";

    for (const memory of memories) {
        const item = document.createElement("div");
        item.className = memory.enabled ? "memory-item" : "memory-item disabled";

        const highlightedContent = renderMemoryContent(
            memory.content || "",
            highlightQuery
        );

        item.innerHTML = `
            <div class="memory-main">
                <div class="memory-meta-row">
                    <span class="memory-id">#${escapeHtml(memory.id)}</span>
                    <span class="memory-type">${escapeHtml(memory.memory_type || "note")}</span>
                    <span class="memory-source">${escapeHtml(memory.source || "user")}</span>
                    <span class="memory-state">${memory.enabled ? "Enabled" : "Disabled"}</span>
                </div>

                <p>${highlightedContent}</p>

                <small>
                    Created: ${escapeHtml(formatMemoryDate(memory.created_at))}
                    · Updated: ${escapeHtml(formatMemoryDate(memory.updated_at))}
                </small>
            </div>

            <div class="memory-actions">
                <button
                    class="micro-button"
                    onclick="setMemoryEnabledFromUi(${Number(memory.id)}, ${memory.enabled ? "false" : "true"})"
                >
                    ${memory.enabled ? "Disable" : "Enable"}
                </button>

                <button
                    class="micro-button danger-button"
                    onclick="deleteMemoryFromUi(${Number(memory.id)})"
                >
                    Delete
                </button>
            </div>
        `;

        container.appendChild(item);
    }
}

function renderMemoryContent(content, highlightQuery) {
    const escapedContent = escapeHtml(content);

    if (!highlightQuery) {
        return escapedContent;
    }

    const trimmedQuery = highlightQuery.trim();

    if (!trimmedQuery) {
        return escapedContent;
    }

    const escapedQuery = escapeRegExp(trimmedQuery);
    const regex = new RegExp(`(${escapedQuery})`, "gi");

    return escapedContent.replace(regex, `<mark class="memory-highlight">$1</mark>`);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatMemoryDate(value) {
    if (!value) {
        return "unknown";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString();
}

function updateSetupStep() {
    document.querySelectorAll(".setup-step").forEach((step) => {
        const stepNumber = Number(step.getAttribute("data-setup-step"));
        step.classList.toggle("active", stepNumber === setupCurrentStep);
    });

    const backButton = document.getElementById("setupBackButton");
    const nextButton = document.getElementById("setupNextButton");
    const finishButton = document.getElementById("setupFinishButton");

    if (backButton) {
        backButton.disabled = setupCurrentStep <= 1;
    }

    if (nextButton) {
        nextButton.classList.toggle("hidden", setupCurrentStep >= setupTotalSteps);
    }

    if (finishButton) {
        finishButton.classList.toggle("hidden", setupCurrentStep < setupTotalSteps);
    }
}

function nextSetupStep() {
    if (setupCurrentStep < setupTotalSteps) {
        setupCurrentStep += 1;
        updateSetupStep();
    }
}

function previousSetupStep() {
    if (setupCurrentStep > 1) {
        setupCurrentStep -= 1;
        updateSetupStep();
    }
}

function populateSetupChecks(data) {
    const container = document.getElementById("setupChecks");

    if (!container) {
        return;
    }

    const checks = data.checks || {};
    const model = data.model || {};
    const voices = data.voices || [];

    const items = [
        {
            label: "Local model",
            ok: Boolean(checks.has_model),
            detail: checks.has_model
                ? `Found: ${model.selected_model || "auto"}`
                : "No GGUF model found in models/"
        },
        {
            label: "Voices",
            ok: Boolean(checks.has_voices),
            detail: checks.has_voices
                ? `${voices.length} voice definition(s) found`
                : "No voices found in voices/"
        },
        {
            label: "Dashboard",
            ok: true,
            detail: "Local web UI is running"
        }
    ];

    container.innerHTML = "";

    for (const item of items) {
        const row = document.createElement("div");
        row.className = item.ok ? "setup-check good" : "setup-check warning";

        row.innerHTML = `
            <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.detail)}</small>
            </div>

            <span>${item.ok ? "Ready" : "Missing"}</span>
        `;

        container.appendChild(row);
    }
}

function populateSetupVoiceSelect(data) {
    const select = document.getElementById("setupVoiceSelect");

    if (!select) {
        return;
    }

    const voices = data.voices || [];
    const selectedVoiceId = data.selected_voice_id || "";

    select.innerHTML = "";

    if (!voices.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No voices found";
        select.appendChild(option);
        return;
    }

    for (const voice of voices) {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = `${voice.display_name} — ${describeVoice(voice)}`;

        if (voice.id === selectedVoiceId) {
            option.selected = true;
        }

        select.appendChild(option);
    }
}

async function finishInitialSetup() {
    const setupPreferOfflineToggle = document.getElementById("setupPreferOfflineToggle");
    const setupAutoSubmitVoiceToggle = document.getElementById("setupAutoSubmitVoiceToggle");
    const setupVoiceSelect = document.getElementById("setupVoiceSelect");

    voxelSettings.preferOfflineMode = setupPreferOfflineToggle
        ? Boolean(setupPreferOfflineToggle.checked)
        : false;

    voxelSettings.autoSubmitVoiceCommand = setupAutoSubmitVoiceToggle
        ? Boolean(setupAutoSubmitVoiceToggle.checked)
        : true;

    saveSettingsToStorage();
    applySettingsToUi();

    if (setupVoiceSelect && setupVoiceSelect.value) {
        await selectVoice(setupVoiceSelect.value);
    }

    try {
        const response = await fetch("/setup/complete", {
            method: "POST"
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not finish setup.");
            return;
        }

        closeInitialSetup();
        showToast("Voxel setup complete.");
    } catch (error) {
        console.warn("Could not complete setup:", error);
        showToast("Could not finish setup.");
    }
}

async function resetInitialSetup() {
    const confirmed = confirm("Reset initial setup? The setup wizard will show again.");

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch("/setup/reset", {
            method: "POST"
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not reset setup.");
            return;
        }

        showToast("Setup reset.");
        await loadSetupStatus();
    } catch (error) {
        console.warn("Could not reset setup:", error);
        showToast("Could not reset setup.");
    }
}

async function loadLowResourceMode() {
    try {
        const response = await fetch("/resource-mode/status");
        const data = await readJsonResponse(response);

        if (!data.ok) {
            return;
        }

        lowResourceMode = Boolean(data.low_resource_mode);

        const toggle = document.getElementById("lowResourceToggle");

        if (toggle) {
            toggle.checked = lowResourceMode;
        }
    } catch (error) {
        console.warn("Could not load low resource mode:", error);
    }
}

async function saveLowResourceModeFromUi() {
    const toggle = document.getElementById("lowResourceToggle");
    const enabled = toggle ? Boolean(toggle.checked) : false;

    try {
        const response = await fetch("/resource-mode/set", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                low_resource_mode: enabled
            })
        });

        const data = await readJsonResponse(response);

        if (!data.ok) {
            showToast(data.error || "Could not update low resource mode.");
            return;
        }

        lowResourceMode = Boolean(data.low_resource_mode);

        if (lowResourceMode) {
            voxelSettings.autoSpeakOnSearch = false;
            saveSettingsToStorage();
            applySettingsToUi();
            showToast("Low Resource Mode enabled.");
        } else {
            showToast("Low Resource Mode disabled.");
        }

        await checkModel();
    } catch (error) {
        console.warn("Could not update low resource mode:", error);
        showToast("Could not update low resource mode.");
    }
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
        isSpeakingAnswer = true;
    } else {
        currentPhraseAudio = audio;
    }

    audio.onplay = function () {
        setVoiceActive(true, label);

        if (kind === "tts") {
            isSpeakingAnswer = true;
            setMicButtonState(isRecordingVoice);
        }
    };

    audio.onended = function () {
        setVoiceActive(false, "Voice idle");
        URL.revokeObjectURL(audioUrl);

        if (kind === "tts") {
            currentTtsAudio = null;
            isSpeakingAnswer = false;
            setMicButtonState(isRecordingVoice);
        } else {
            currentPhraseAudio = null;
        }
    };

    audio.onerror = function () {
        setVoiceActive(false, "Voice error");
        URL.revokeObjectURL(audioUrl);

        if (kind === "tts") {
            currentTtsAudio = null;
            isSpeakingAnswer = false;
            setMicButtonState(isRecordingVoice);
        } else {
            currentPhraseAudio = null;
        }

        showToast("Audio playback failed.");
    };
    await audio.play();
    setMicButtonState(isRecordingVoice);
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

    isSpeakingAnswer = false;
    setVoiceActive(false, "Voice idle");
}

function cleanTextForSpeech(text) {
    let cleaned = String(text || "");

    cleaned = cleaned
        // Remove code fences.
        .replace(/```[\w-]*\n?/g, "")
        .replace(/```/g, "")

        // Inline code.
        .replace(/`([^`]+)`/g, "$1")

        // Markdown links.
        .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")

        // Citation tags like [1], [2], [3].
        .replace(/\s*\[\d+]/g, "")

        // Headings.
        .replace(/^#{1,6}\s+/gm, "")

        // Lists.
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")

        // Blockquotes.
        .replace(/^\s*>\s?/gm, "");

    // Strip Markdown emphasis markers globally.
    // This is intentionally blunt because TTS should never read Markdown symbols.
    cleaned = cleaned
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/\*/g, "")
        .replace(/_/g, "");

    cleaned = cleaned
        // Operators.
        .replace(/\s*=\s*/g, " equals ")
        .replace(/\s*\+\s*/g, " plus ")
        .replace(/\s*-\s*/g, " minus ")
        .replace(/\s*\/\s*/g, " divided by ")

        // Line/spacing cleanup.
        .replace(/\n{2,}/g, ". ")
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();

    return cleaned;
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

    const speechText = cleanTextForSpeech(answer);

    console.log("RAW TTS TEXT:", answer);
    console.log("CLEANED TTS TEXT:", speechText);

    try {
        setVoiceActive(true, "Generating voice...");

        const response = await fetch("/voice/speak", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({
                text: speechText,
                voice_id: "selected"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
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

    // Barge-in:
    // If Voxel is currently speaking, immediately interrupt speech
    // and begin recording the user's new command.
    if (isSpeakingAnswer || currentTtsAudio || currentPhraseAudio) {
        stopSpeaking();
        showToast("Interrupted. Listening...");
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

    if (active) {
        micButton.title = "Stop recording";
    } else if (isSpeakingAnswer || currentTtsAudio) {
        micButton.title = "Interrupt and talk";
    } else {
        micButton.title = "Push to talk";
    }
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

    setLoading(true, "Routing request...");
    setAnswer("Working...");
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

        const backendTotalMs = data?.debug?.latency?.total_ms;
        const displayElapsed = backendTotalMs !== undefined && backendTotalMs !== null
            ? `${(backendTotalMs / 1000).toFixed(2)}s`
            : `${elapsed}s`;

        if (data.mode === "tool") {
            setAnswer(data.answer || "Tool returned no answer.");
            setSources([]);
            setMeta(`Tool · ${data.tool || "unknown"} · ${displayElapsed}`, "0 sources");
        } else if (data.mode === "offline-local") {
            setAnswer(`[Offline/local mode]\n\n${data.answer || "Voxel returned no answer."}`);
            setSources(data.sources || []);
            setMeta(`${data.mode || "Done"} · ${displayElapsed}`, `${(data.sources || []).length} sources`);
        } else {
            setAnswer(data.answer || "Voxel returned no answer.");
            setSources(data.sources || []);
            setMeta(`${data.mode || "Done"} · ${displayElapsed}`, `${(data.sources || []).length} sources`);
        }

        setSources(data.sources || []);
        setMeta(`${data.mode || "Done"} · ${elapsed}s`, `${(data.sources || []).length} sources`);

        if (data.debug && data.debug.model) {
            setModelStatus(Boolean(data.debug.model.model_found), data.debug.model);
            populateModelPicker(data.debug.model);
        }

        showToast("Voxel answered.");
        playVoicePhrase("complete");
        if (voxelSettings.autoSpeakOnSearch && !isRecordingVoice) {
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
    const debugSummary = document.getElementById("debugSummary");

    if (debugOutput) {
        debugOutput.textContent = data ? JSON.stringify(data, null, 2) : "No request yet.";
    }

    if (!debugSummary) {
        return;
    }

    if (!data) {
        debugSummary.innerHTML = `<div class="empty">No debug data yet.</div>`;
        return;
    }

    debugSummary.innerHTML = renderDebugSummary(data);
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

function renderDebugSummary(data) {
    const debug = data.debug || {};
    const latency = debug.latency || {};
    const mode = data.mode || "unknown";
    const route = debug.route || mode;
    const tool = data.tool || "none";
    const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;

    const lowResource = debug.resource_mode && debug.resource_mode.low_resource_mode
    ? "on"
    : "off";

    return `
        <div class="debug-grid">
            ${renderDebugCard("Mode", mode)}
            ${renderDebugCard("Route", route)}
            ${renderDebugCard("Tool", tool)}
            ${renderDebugCard("Sources", String(sourceCount))}
            ${renderDebugCard("Low Resource", lowResource)}
        </div>

        ${renderLatencyPanel(latency)}
        ${renderRouteDebugPanel(data)}
        ${renderToolDebugPanel(debug.tool)}
        ${renderModelDebugPanel(debug.model)}
    `;
}

function renderDebugCard(label, value) {
    return `
        <div class="debug-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(formatDebugValue(value))}</strong>
        </div>
    `;
}

function renderLatencyPanel(latency) {
    if (!latency || Object.keys(latency).length === 0) {
        return `
            <div class="debug-section">
                <h4>Latency</h4>
                <div class="empty">No latency data.</div>
            </div>
        `;
    }

    const rows = [
        ["Total", latency.total_ms],
        ["Routing", latency.routing_ms],
        ["Tool", latency.tool_ms],
        ["Network check", latency.network_check_ms],
        ["Search", latency.search_ms],
        ["AI", latency.ai_ms],
        ["Storage", latency.storage_ms],
    ];

    return `
        <div class="debug-section">
            <div class="debug-section-title-row">
                <h4>Latency</h4>
                <span>${formatDebugValue(latency.total_ms)}ms total</span>
            </div>

            <div class="latency-list">
                ${rows.map(([label, value]) => renderLatencyRow(label, value, latency.total_ms)).join("")}
            </div>
        </div>
    `;
}

function renderLatencyRow(label, value, total) {
    const skipped = value === null || value === undefined;
    const displayValue = skipped ? "skipped" : `${value}ms`;

    const percent = !skipped && total
        ? Math.max(2, Math.min(100, (Number(value) / Number(total)) * 100))
        : 0;

    return `
        <div class="latency-row ${skipped ? "skipped" : ""}">
            <div class="latency-row-top">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(displayValue)}</strong>
            </div>

            <div class="latency-bar">
                <div style="width: ${percent}%"></div>
            </div>
        </div>
    `;
}

function renderRouteDebugPanel(data) {
    const debug = data.debug || {};

    const rows = [
        ["Original", debug.original],
        ["Cleaned", debug.cleaned || data.question],
        ["Online", debug.online],
        ["Forced offline", debug.forced_offline],
        ["Source count", debug.source_count],
    ];

    const visibleRows = rows.filter(([, value]) => value !== undefined);

    if (!visibleRows.length) {
        return "";
    }

    return `
        <div class="debug-section">
            <h4>Route</h4>
            <div class="debug-kv-list">
                ${visibleRows.map(([key, value]) => renderDebugKeyValue(key, value)).join("")}
            </div>
        </div>
    `;
}

function renderToolDebugPanel(toolDebug) {
    if (!toolDebug) {
        return "";
    }

    const rows = Object.entries(toolDebug)
        .map(([key, value]) => renderDebugKeyValue(key, value))
        .join("");

    return `
        <div class="debug-section">
            <h4>Tool Debug</h4>
            <div class="debug-kv-list">${rows}</div>
        </div>
    `;
}

function renderModelDebugPanel(modelDebug) {
    if (!modelDebug) {
        return "";
    }

    const rows = [
        ["Model found", modelDebug.model_found],
        ["Selected model", modelDebug.selected_model],
        ["Loaded", modelDebug.loaded],
        ["Loaded model path", modelDebug.loaded_model_path],
        ["Model path", modelDebug.model_path],
    ];

    return `
        <div class="debug-section">
            <h4>Model</h4>
            <div class="debug-kv-list">
                ${rows.map(([key, value]) => renderDebugKeyValue(key, value)).join("")}
            </div>
        </div>
    `;
}

function renderDebugKeyValue(key, value) {
    return `
        <div class="debug-kv-row">
            <span>${escapeHtml(key)}</span>
            <strong>${escapeHtml(formatDebugValue(value))}</strong>
        </div>
    `;
}

function formatDebugValue(value) {
    if (value === null || value === undefined) {
        return "none";
    }

    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
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
        .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\">$1</a>")

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
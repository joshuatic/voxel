# Voxel

<img src="assets/voxel.png" alt="Voxel logo" width="1024">

Voxel is a **local-first AI assistant** that runs on your own machine through a lightweight web dashboard.

It is designed to feel like a private desktop copilot:
- answers questions with a local GGUF model,
- uses web search when the internet is available,
- supports push-to-talk voice input,
- and can speak responses with local voices.

---

## What Voxel does

- **Local-first answering** with `llama-cpp-python` and GGUF models in `models/`
- **Web-assisted answers** using DuckDuckGo search (`ddgs`) when online
- **Offline fallback** when internet is unavailable (or user forces local mode)
- **Voice output** via local Piper voices (`/voice/speak`)
- **Voice input** via Faster-Whisper transcription (`/voice/transcribe`)
- **Search history + settings** persisted in local SQLite (`data/voxel.db`)
- **Assistant personality control** (get/set/reset)
- **Voice pack import** from ZIP files with validation/safety checks
- **Cache visibility + clearing** for generated/downloaded audio data

---

## Tech stack (current)

- **Backend:** FastAPI
- **Frontend:** static HTML/CSS/JS dashboard in `static/`
- **Local LLM runtime:** `llama-cpp-python`
- **Web search:** `ddgs`
- **Speech-to-text:** `faster-whisper`
- **Data storage:** SQLite (`data/voxel.db`)
- **Key storage for cloud providers:** system keyring backend

No cloud dependency is required for a core local operation.

---

## Project layout

```text
app/
  main.py             # FastAPI app + API routes
  command_router.py   # Online/offline routing logic
  local_ai.py         # GGUF model selection/loading/inference
  search.py           # DuckDuckGo search + result formatting
  transcription.py    # Faster-Whisper transcription pipeline
  tts.py              # Piper CLI speech synthesis
  voice.py            # Voice listing/selection/phrase serving
  voice_import.py     # Voice ZIP import + validation
  api_keys.py         # Provider key + provider state management
  personality.py      # Assistant personality storage
  storage.py          # SQLite schema + read/write operations
  cache_manager.py    # Cache size/status/clear operations
  network.py          # Simple internet reachability check
  config.py           # Paths and app-level constants
  logging_setup.py    # Startup log rotation + logger setup

static/
  index.html          # Dashboard shell
  app.js              # UI logic + API calls + voice controls
  styles.css          # UI styling

models/               # Put GGUF model files here
voices/               # Voice packs (Piper or phrase packs)
data/                 # SQLite DB + runtime cache data
logs/                 # latest.log + rotated compressed logs
```

---

## Quick start (Windows / PowerShell)

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install Python dependencies:

```powershell
pip install -r requirements.txt
```

3. Add at least one GGUF model to `models/`.
   - Voxel auto-selects the first `.gguf` file in that folder when set to `auto`.

4. Ensure the required local tooling is available:
   - `piper` command available in PATH (for TTS)
   - FFmpeg/`av` installed if audio decoding issues appear during transcription

5. Run the app:

```powershell
.\run.ps1
```

By default, the server runs at `http://127.0.0.1:8787`.

---

## Runtime behavior notes

- If the internet is reachable, command routing can do **search + summarize**.
- If the internet is unavailable (or the user uses local/offline prefix), Voxel uses **local-only answering**.
- API provider keys (OpenAI/OpenRouter/Gemini) are optional and managed through keyring-backed settings endpoints.
- Voice import enforces safe ZIP paths and allowed file types.

---

## API highlights

- Health/model: `/health`, `/model/status`, `/model/list`, `/model/select`
- Search/commands: `/search`, `/command`
- History/suggestions: `/history/recent`, `/history/clear`, `/suggestions`
- Voice: `/voice/list`, `/voice/select`, `/voice/phrase`, `/voice/speak`, `/voice/transcribe`, `/voice/import`
- Personality: `/personality`, `/personality/reset`
- API keys/providers: `/api-keys/status`, `/api-keys/set`, `/api-keys/clear`, `/api-keys/enabled`, `/api-keys/active`
- Cache/network: `/cache/status`, `/cache/clear`, `/network/status`

---

## Privacy model

Voxel is built to run locally first. Data (history/settings/logs/cache) is stored on the local machine. Internet usage is primarily for web search and any explicitly enabled external provider usage.

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

---
## License

Voxel is licensed under the GNU General Public License v3.0 or later.

See [LICENSE](LICENSE) for details.

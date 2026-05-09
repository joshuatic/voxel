import logging
import time
import os

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi import UploadFile, File
from pydantic import BaseModel

from app.personality import (
    get_personality,
    set_personality,
    reset_personality,
)
from app.tts import speak_to_file
from app.transcription import transcribe_audio_bytes, preload_whisper_model
from app.config import APP_NAME, APP_VERSION, STATIC_DIR
from app.logging_setup import setup_logging
from app.search import search_web, format_results_for_ai
from app.storage import (
    initialize_storage,
    save_search,
    get_recent_searches,
    get_suggested_prompts,
    clear_search_history,
)
from app.local_ai import (
    get_model_status,
    list_available_models,
    set_selected_model,
    summarize_search_results,
)
from app.voice import (
    list_voices,
    get_selected_voice_id,
    set_selected_voice_id,
    list_voice_phrases,
    get_phrase_audio_path,
    get_audio_media_type,
)
from app.api_keys import (
    get_provider_status,
    set_provider_key,
    clear_provider_key,
    set_provider_enabled,
    set_active_provider,
)
from app.voice_import import import_voice_zip
from app.command_router import route_command
from app.network import internet_available
from app.cache_manager import get_cache_status, clear_cache
from app.setup_state import (
    get_setup_status,
    set_setup_complete,
)
from app.resource_mode import (
    get_resource_mode_status,
    set_low_resource_mode_enabled,
    is_low_resource_mode_enabled,
)
from app.memory import (
    create_memory,
    list_memories,
    search_memories,
    set_memory_enabled,
    delete_memory,
    clear_memories,
)

setup_logging()
initialize_storage()

logger = logging.getLogger("voxel")
try:
    if is_low_resource_mode_enabled():
        logger.info("Whisper preload skipped because low resource mode is enabled.")
    else:
        preload_whisper_model()
        logger.info("Whisper transcription model preloaded.")
except Exception as error:
    logger.warning("Whisper preload failed: %s", error)

app = FastAPI(title=f"{APP_NAME} v{APP_VERSION}")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def build_error_response(error: Exception, status_code: int = 500, **extra_content):
    content = {
        "ok": False,
        "error": str(error),
        "error_type": type(error).__name__,
    }
    content.update(extra_content)

    return JSONResponse(
        status_code=status_code,
        content=content,
    )


def provider_status_response():
    return {
        "ok": True,
        **get_provider_status(),
    }

class VoiceSpeakRequest(BaseModel):
    text: str
    voice_id: str = "selected"
class PersonalityRequest(BaseModel):
    personality: str
class ApiKeyRequest(BaseModel):
    provider_id: str
    api_key: str
class ApiProviderEnabledRequest(BaseModel):
    provider_id: str
    enabled: bool
class ActiveProviderRequest(BaseModel):
    provider_id: str
class CacheClearRequest(BaseModel):
    cache_id: str
class ResourceModeRequest(BaseModel):
    low_resource_mode: bool
class MemoryCreateRequest(BaseModel):
    content: str
    memory_type: str = "note"
    source: str = "user"
    enabled: bool = True
class MemorySearchRequest(BaseModel):
    query: str
    include_disabled: bool = False
    limit: int = 25
class MemoryEnabledRequest(BaseModel):
    memory_id: int
    enabled: bool
class MemoryDeleteRequest(BaseModel):
    memory_id: int

@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/health")
async def health():
    return {
        "ok": True,
        "name": APP_NAME,
        "version": APP_VERSION,
        "url": os.environ.get("VOXEL_URL", "http://127.0.0.1:8787"),
        "status": "online",
        "mode": "search-local-ai",
    }

@app.get("/model/status")
async def model_status():
    status = get_model_status()

    return {
        "ok": True,
        **status,
    }

@app.get("/model/list")
async def model_list():
    return {
        "ok": True,
        "models": list_available_models(),
    }

@app.post("/model/select")
async def model_select(name: str = Query(...)):
    return set_selected_model(name)

@app.get("/api-keys/status")
async def api_keys_status():
    return provider_status_response()

@app.post("/api-keys/set")
async def api_keys_set(payload: ApiKeyRequest):
    try:
        set_provider_key(payload.provider_id, payload.api_key)
        set_provider_enabled(payload.provider_id, True)

        logger.info("API key saved for provider: %s", payload.provider_id)

        return provider_status_response()

    except Exception as error:
        logger.exception("Failed to save API key.")

        return build_error_response(error)

@app.post("/api-keys/clear")
async def api_keys_clear(payload: ActiveProviderRequest):
    try:
        clear_provider_key(payload.provider_id)

        logger.info("API key cleared for provider: %s", payload.provider_id)

        return provider_status_response()

    except Exception as error:
        logger.exception("Failed to clear API key.")

        return build_error_response(error)

@app.post("/api-keys/enabled")
async def api_keys_enabled(payload: ApiProviderEnabledRequest):
    try:
        set_provider_enabled(payload.provider_id, payload.enabled)

        return provider_status_response()

    except Exception as error:
        logger.exception("Failed to update provider enabled state.")

        return build_error_response(error)

@app.post("/api-keys/active")
async def api_keys_active(payload: ActiveProviderRequest):
    try:
        set_active_provider(payload.provider_id)

        return provider_status_response()

    except Exception as error:
        logger.exception("Failed to update active provider.")

        return build_error_response(error)
    
@app.post("/search")
async def search(text: str = Query(...)):
    started_at = time.perf_counter()

    logger.info("Search requested: %s", text)

    try:
        search_response = search_web(text)
        results = search_response["results"]

        if not search_response["ok"]:
            logger.warning("Search failed: %s | debug=%s", text, search_response.get("debug", {}))

            return {
                "ok": False,
                "question": text,
                "answer": "No search results found.",
                "sources": [],
                "debug": search_response.get("debug", {}),
            }

        context = format_results_for_ai(text, results)
        answer = summarize_search_results(text, context)

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        model_status = get_model_status()
        selected_model = model_status.get("selected_model")

        search_id = save_search(
            query=text,
            answer=answer,
            sources=results,
            model_name=selected_model,
            elapsed_ms=elapsed_ms,
        )

        logger.info(
            "Search completed: id=%s query=%s sources=%s elapsed_ms=%s model=%s",
            search_id,
            text,
            len(results),
            elapsed_ms,
            selected_model,
        )

        return {
            "ok": True,
            "id": search_id,
            "question": text,
            "answer": answer,
            "sources": results,
            "debug": {
                "search": search_response.get("debug", {}),
                "source_count": len(results),
                "model": model_status,
                "elapsed_ms": elapsed_ms,
            },
        }

    except Exception as error:
        logger.exception("Search crashed: %s", text)

        return build_error_response(error, question=text)

@app.get("/history/recent")
async def history_recent():
    return {
        "ok": True,
        "searches": get_recent_searches(limit=12),
    }

@app.post("/history/clear")
async def history_clear():
    try:
        clear_search_history()

        logger.info("Search history cleared.")

        return {
            "ok": True,
            "message": "Search history cleared.",
        }

    except Exception as error:
        logger.exception("Failed to clear search history.")

        return build_error_response(error)

@app.get("/suggestions")
async def suggestions():
    return {
        "ok": True,
        "suggestions": get_suggested_prompts(limit=6),
    }

@app.get("/voice/list")
async def voice_list():
    return {
        "ok": True,
        "selected_voice_id": get_selected_voice_id(),
        "voices": list_voices(),
    }


@app.post("/voice/select")
async def voice_select(voice_id: str = Query(...)):
    return set_selected_voice_id(voice_id)


@app.get("/voice/phrases")
async def voice_phrases(voice_id: str = Query("selected")):
    if voice_id == "selected":
        voice_id = get_selected_voice_id()

    return {
        "ok": True,
        "voice_id": voice_id,
        "phrases": list_voice_phrases(voice_id),
    }


@app.get("/voice/phrase")
async def voice_phrase(
    voice_id: str = Query("selected"),
    phrase_id: str = Query(...),
):
    try:
        audio_path = get_phrase_audio_path(voice_id, phrase_id)

        return FileResponse(
            audio_path,
            media_type=get_audio_media_type(audio_path),
            filename=audio_path.name,
        )

    except Exception as error:
        logger.warning("Voice phrase failed: %s", error)

        return build_error_response(error, status_code=404)

@app.post("/voice/speak")
async def voice_speak(payload: VoiceSpeakRequest):
    try:
        output_path = speak_to_file(
            text=payload.text,
            voice_id=payload.voice_id,
        )

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename=output_path.name,
        )

    except Exception as error:
        logger.exception("Voice speak failed.")

        return build_error_response(error)

@app.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    try:
        audio_bytes = await file.read()

        suffix = ".webm"

        if file.filename and "." in file.filename:
            suffix = "." + file.filename.rsplit(".", 1)[-1].lower()

        result = transcribe_audio_bytes(audio_bytes, suffix=suffix)

        return result

    except Exception as error:
        logger.exception("Voice transcription failed.")

        return build_error_response(
            error,
            hint="If this mentions audio decoding, install av and FFmpeg.",
        )

@app.post("/voice/import")
async def voice_import(file: UploadFile = File(...)):
    try:
        if not file.filename or not file.filename.lower().endswith(".zip"):
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": "Voice import requires a .zip file.",
                },
            )

        zip_bytes = await file.read()
        result = import_voice_zip(zip_bytes)

        logger.info("Voice imported: %s", result.get("voice_id"))

        return result

    except Exception as error:
        logger.exception("Voice import failed.")

        return build_error_response(error)

@app.get("/network/status")
async def network_status():
    return {
        "ok": True,
        "online": internet_available(),
    }


@app.post("/command")
async def command(text: str = Query(...)):
    try:
        return route_command(text)

    except Exception as error:
        logger.exception("Command crashed: %s", text)

        return build_error_response(error, question=text)

@app.get("/personality")
async def personality_get():
    return {
        "ok": True,
        "personality": get_personality(),
    }


@app.post("/personality")
async def personality_set(payload: PersonalityRequest):
    try:
        set_personality(payload.personality)

        logger.info("Assistant personality updated.")

        return {
            "ok": True,
            "personality": get_personality(),
        }

    except Exception as error:
        logger.exception("Failed to update personality.")

        return build_error_response(error)


@app.post("/personality/reset")
async def personality_reset():
    reset_personality()

    logger.info("Assistant personality reset.")

    return {
        "ok": True,
        "personality": get_personality(),
    }

@app.get("/cache/status")
async def cache_status():
    return {
        "ok": True,
        **get_cache_status(),
    }

@app.post("/cache/clear")
async def cache_clear(payload: CacheClearRequest):
    try:
        result = clear_cache(payload.cache_id)

        logger.info("Cache cleared: %s", payload.cache_id)

        return result

    except Exception as error:
        logger.exception("Cache clear failed.")

        return build_error_response(error)

@app.get("/setup/status")
async def setup_status():
    return {
        "ok": True,
        **get_setup_status(),
    }


@app.post("/setup/complete")
async def setup_complete():
    try:
        set_setup_complete(True)

        logger.info("Initial setup marked complete.")

        return {
            "ok": True,
            **get_setup_status(),
        }

    except Exception as error:
        logger.exception("Failed to complete setup.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )


@app.post("/setup/reset")
async def setup_reset():
    try:
        set_setup_complete(False)

        logger.info("Initial setup reset.")

        return {
            "ok": True,
            **get_setup_status(),
        }

    except Exception as error:
        logger.exception("Failed to reset setup.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )

@app.get("/resource-mode/status")
async def resource_mode_status():
    return {
        "ok": True,
        **get_resource_mode_status(),
    }


@app.post("/resource-mode/set")
async def resource_mode_set(payload: ResourceModeRequest):
    try:
        set_low_resource_mode_enabled(payload.low_resource_mode)

        logger.info("Low resource mode updated: %s", payload.low_resource_mode)

        return {
            "ok": True,
            **get_resource_mode_status(),
        }

    except Exception as error:
        logger.exception("Failed to update low resource mode.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )

@app.get("/memory/list")
async def memory_list(include_disabled: bool = False, limit: int = 100):
    return {
        "ok": True,
        "memories": list_memories(
            include_disabled=include_disabled,
            limit=limit,
        ),
    }


@app.post("/memory/create")
async def memory_create(payload: MemoryCreateRequest):
    try:
        memory = create_memory(
            content=payload.content,
            memory_type=payload.memory_type,
            source=payload.source,
            enabled=payload.enabled,
        )

        logger.info("Memory created: id=%s type=%s", memory["id"], memory["memory_type"])

        return {
            "ok": True,
            "memory": memory,
        }

    except Exception as error:
        logger.exception("Failed to create memory.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )


@app.post("/memory/search")
async def memory_search(payload: MemorySearchRequest):
    try:
        return {
            "ok": True,
            "memories": search_memories(
                query=payload.query,
                include_disabled=payload.include_disabled,
                limit=payload.limit,
            ),
        }

    except Exception as error:
        logger.exception("Failed to search memories.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )


@app.post("/memory/enabled")
async def memory_enabled(payload: MemoryEnabledRequest):
    try:
        memory = set_memory_enabled(
            memory_id=payload.memory_id,
            enabled=payload.enabled,
        )

        return {
            "ok": True,
            "memory": memory,
        }

    except Exception as error:
        logger.exception("Failed to update memory enabled state.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )


@app.post("/memory/delete")
async def memory_delete(payload: MemoryDeleteRequest):
    try:
        memory = delete_memory(payload.memory_id)

        return {
            "ok": True,
            "deleted": memory,
        }

    except Exception as error:
        logger.exception("Failed to delete memory.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )


@app.post("/memory/clear")
async def memory_clear():
    try:
        deleted_count = clear_memories()

        logger.info("All memories cleared: count=%s", deleted_count)

        return {
            "ok": True,
            "deleted_count": deleted_count,
        }

    except Exception as error:
        logger.exception("Failed to clear memories.")

        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(error),
                "error_type": type(error).__name__,
            },
        )
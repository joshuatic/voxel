import logging
import time

from app.local_ai import answer_locally, get_model_status, summarize_search_results
from app.network import internet_available
from app.search import search_web, format_results_for_ai
from app.storage import save_search

logger = logging.getLogger("voxel")


def clean_activation_word(text: str) -> str:
    """
    Removes activation prefixes from typed or voice input.

    Later, voice input can send:
        "Voxel, what is Python?"

    The router turns it into:
        "what is Python?"
    """
    cleaned = text.strip()

    lowered = cleaned.lower()

    prefixes = [
        "voxel,",
        "voxel",
        "hey voxel,",
        "hey voxel",
        "okay voxel,",
        "okay voxel",
    ]

    for prefix in prefixes:
        if lowered.startswith(prefix):
            return cleaned[len(prefix):].strip(" ,.")

    return cleaned


def should_force_offline(text: str) -> bool:
    lowered = text.lower().strip()

    offline_phrases = [
        "offline ",
        "local ",
        "without internet ",
        "no internet ",
    ]

    return any(lowered.startswith(prefix) for prefix in offline_phrases)


def strip_mode_prefixes(text: str) -> str:
    lowered = text.lower().strip()

    prefixes = [
        "offline ",
        "local ",
        "without internet ",
        "no internet ",
        "search ",
        "look up ",
    ]

    for prefix in prefixes:
        if lowered.startswith(prefix):
            return text[len(prefix):].strip()

    return text.strip()


def route_command(text: str) -> dict:
    """
    Unified Voxel command entry point.

    Current behavior:
    - If online: search web + summarize.
    - If offline or forced local: local model answer only.

    Later this router can handle:
    - clear history
    - model status
    - voice status
    - timers
    - PC commands
    - Spotify
    """
    started_at = time.perf_counter()

    original_text = text
    cleaned_text = clean_activation_word(text)
    forced_offline = should_force_offline(cleaned_text)
    command_text = strip_mode_prefixes(cleaned_text)

    if not command_text:
        return {
            "ok": False,
            "mode": "none",
            "answer": "No command text was provided.",
            "sources": [],
        }

    online = internet_available()

    logger.info(
        "Command requested: original=%s cleaned=%s online=%s forced_offline=%s",
        original_text,
        command_text,
        online,
        forced_offline,
    )

    if forced_offline or not online:
        offline_reason = (
            "forced local-only mode requested by the user"
            if forced_offline
            else "internet was not detected, so Voxel automatically switched to offline mode"
        )

        answer = answer_locally(command_text, offline_reason=offline_reason)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        search_id = save_search(
            query=command_text,
            answer=answer,
            sources=[],
            model_name=get_model_status().get("selected_model"),
            elapsed_ms=elapsed_ms,
        )

        return {
            "ok": True,
            "id": search_id,
            "mode": "offline-local",
            "question": command_text,
            "answer": answer,
            "sources": [],
            "debug": {
                "online": online,
                "forced_offline": forced_offline,
                "elapsed_ms": elapsed_ms,
                "model": get_model_status(),
            },
        }

    search_response = search_web(command_text)
    results = search_response["results"]

    if not search_response["ok"]:
        answer = answer_locally(command_text)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        search_id = save_search(
            query=command_text,
            answer=answer,
            sources=[],
            model_name=get_model_status().get("selected_model"),
            elapsed_ms=elapsed_ms,
        )

        return {
            "ok": True,
            "id": search_id,
            "mode": "search-failed-local-fallback",
            "question": command_text,
            "answer": answer,
            "sources": [],
            "debug": {
                "search": search_response.get("debug", {}),
                "elapsed_ms": elapsed_ms,
                "model": get_model_status(),
            },
        }

    context = format_results_for_ai(command_text, results)
    answer = summarize_search_results(command_text, context)

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    model_status = get_model_status()

    search_id = save_search(
        query=command_text,
        answer=answer,
        sources=results,
        model_name=model_status.get("selected_model"),
        elapsed_ms=elapsed_ms,
    )

    logger.info(
        "Command completed: id=%s mode=online-search query=%s sources=%s elapsed_ms=%s",
        search_id,
        command_text,
        len(results),
        elapsed_ms,
    )

    return {
        "ok": True,
        "id": search_id,
        "mode": "online-search",
        "question": command_text,
        "answer": answer,
        "sources": results,
        "debug": {
            "online": online,
            "forced_offline": forced_offline,
            "search": search_response.get("debug", {}),
            "source_count": len(results),
            "elapsed_ms": elapsed_ms,
            "model": model_status,
        },
    }
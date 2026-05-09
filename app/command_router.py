import logging
import time
from typing import Any

from app.local_ai import answer_locally, get_model_status, summarize_search_results
from app.network import internet_available
from app.search import search_web
from app.storage import save_search
from app.tools.registry import run_tool_if_available
from app.resource_mode import get_resource_mode_status

logger = logging.getLogger("voxel")


def clean_activation_word(text: str) -> str:
    """
    Removes activation prefixes from typed or voice input.

    Examples:
        "Voxel, what is Python?" -> "what is Python?"
        "Hey Voxel what time is it?" -> "what time is it?"
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
    """
    Returns True when the user explicitly asks Voxel to answer locally/offline.
    """
    lowered = text.lower().strip()

    offline_phrases = [
        "offline ",
        "local ",
        "without internet ",
        "no internet ",
    ]

    return any(lowered.startswith(prefix) for prefix in offline_phrases)


def strip_mode_prefixes(text: str) -> str:
    """
    Removes routing prefixes from the user query after the router has detected them.

    Examples:
        "local explain minecraft" -> "explain minecraft"
        "search latest windows update" -> "latest windows update"
    """
    stripped = text.strip()
    lowered = stripped.lower()

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
            return stripped[len(prefix):].strip()

    return stripped


def create_latency_bucket() -> dict[str, int | None]:
    """
    Creates one consistent latency object for every command route.

    None means that phase was skipped.
    """
    return {
        "total_ms": 0,
        "routing_ms": 0,
        "tool_ms": None,
        "network_check_ms": None,
        "search_ms": None,
        "ai_ms": None,
        "storage_ms": None,
    }


def elapsed_ms_since(started_at: float) -> int:
    return int((time.perf_counter() - started_at) * 1000)


def normalize_search_response(raw_response: Any) -> tuple[bool, list[dict], dict]:
    """
    Supports both possible search_web shapes:

    1. Newer shape:
        {
            "ok": true,
            "results": [...],
            "debug": {...}
        }

    2. Older/simple shape:
        [...]
    """
    if isinstance(raw_response, dict):
        ok = bool(raw_response.get("ok", True))
        results = raw_response.get("results", [])

        if results is None:
            results = []

        debug = raw_response.get("debug", {})

        return ok, results, debug

    if isinstance(raw_response, list):
        return True, raw_response, {}

    return False, [], {
        "error": "search_web returned an unsupported response type",
        "response_type": type(raw_response).__name__,
    }


def save_search_with_latency(
    *,
    query: str,
    answer: str,
    sources: list[dict],
    model_name: str | None,
    elapsed_ms: int,
    latency: dict[str, int | None],
) -> int:
    """
    Saves search history while measuring storage latency.
    """
    storage_started_at = time.perf_counter()

    search_id = save_search(
        query=query,
        answer=answer,
        sources=sources,
        model_name=model_name,
        elapsed_ms=elapsed_ms,
    )

    latency["storage_ms"] = elapsed_ms_since(storage_started_at)

    return search_id


def route_command(text: str) -> dict:
    """
    Unified Voxel command entry point.

    Current behavior:
    - Clean activation words.
    - Detect local/offline prefixes.
    - Route tools before web search.
    - If online: search the web and summarize.
    - If offline or forced local: local model answer only.

    Tool routing must happen before network/search logic.
    """
    started_at = time.perf_counter()
    latency = create_latency_bucket()

    original_text = text
    activated_text = clean_activation_word(text)
    forced_offline = should_force_offline(activated_text)
    command_text = strip_mode_prefixes(activated_text)

    if not command_text:
        latency["total_ms"] = elapsed_ms_since(started_at)

        return {
            "ok": False,
            "mode": "none",
            "question": "",
            "answer": "No command text was provided.",
            "sources": [],
            "debug": {
                "route": "none",
                "latency": latency,
            },
        }

    # ------------------------------------------------------------
    # Tool routing
    # ------------------------------------------------------------
    tool_route_started_at = time.perf_counter()
    tool_result = run_tool_if_available(command_text)
    latency["routing_ms"] = elapsed_ms_since(tool_route_started_at)

    if tool_result is not None:
        latency["tool_ms"] = (tool_result.debug or {}).get("latency_ms")
        latency["total_ms"] = elapsed_ms_since(started_at)

        logger.info(
            "Command completed: mode=tool tool=%s query=%s elapsed_ms=%s",
            tool_result.tool_id,
            command_text,
            latency["total_ms"],
        )

        return {
            "ok": tool_result.ok,
            "mode": "tool",
            "tool": tool_result.tool_id,
            "question": command_text,
            "answer": tool_result.content,
            "sources": [],
            "debug": {
                "route": "tool",
                "original": original_text,
                "cleaned": command_text,
                "forced_offline": forced_offline,
                "latency": latency,
                "resource_mode": get_resource_mode_status(),
                "tool": tool_result.debug,
            },
        }

    # ------------------------------------------------------------
    # Network detection
    # ------------------------------------------------------------
    network_started_at = time.perf_counter()
    online = internet_available()
    latency["network_check_ms"] = elapsed_ms_since(network_started_at)

    logger.info(
        "Command requested: original=%s cleaned=%s online=%s forced_offline=%s",
        original_text,
        command_text,
        online,
        forced_offline,
    )

    # ------------------------------------------------------------
    # Offline/local route
    # ------------------------------------------------------------
    if forced_offline or not online:
        offline_reason = (
            "forced local-only mode requested by the user"
            if forced_offline
            else "internet was not detected, so Voxel automatically switched to offline mode"
        )

        ai_started_at = time.perf_counter()
        answer = answer_locally(command_text, offline_reason=offline_reason)
        latency["ai_ms"] = elapsed_ms_since(ai_started_at)

        model_status = get_model_status()
        elapsed_ms = elapsed_ms_since(started_at)
        latency["total_ms"] = elapsed_ms

        search_id = save_search_with_latency(
            query=command_text,
            answer=answer,
            sources=[],
            model_name=model_status.get("selected_model"),
            elapsed_ms=elapsed_ms,
            latency=latency,
        )

        latency["total_ms"] = elapsed_ms_since(started_at)

        logger.info(
            "Command completed: id=%s mode=offline-local query=%s elapsed_ms=%s",
            search_id,
            command_text,
            latency["total_ms"],
        )

        return {
            "ok": True,
            "id": search_id,
            "mode": "offline-local",
            "question": command_text,
            "answer": answer,
            "sources": [],
            "debug": {
                "route": "offline-local",
                "original": original_text,
                "cleaned": command_text,
                "online": online,
                "forced_offline": forced_offline,
                "offline_reason": offline_reason,
                "latency": latency,
                "resource_mode": get_resource_mode_status(),
                "model": model_status,
            },
        }

    # ------------------------------------------------------------
    # Online search route
    # ------------------------------------------------------------
    search_started_at = time.perf_counter()
    raw_search_response = search_web(command_text)
    latency["search_ms"] = elapsed_ms_since(search_started_at)

    search_ok, results, search_debug = normalize_search_response(raw_search_response)

    if not search_ok:
        fallback_reason = "web search failed, so Voxel switched to local fallback"

        ai_started_at = time.perf_counter()
        answer = answer_locally(command_text, offline_reason=fallback_reason)
        latency["ai_ms"] = elapsed_ms_since(ai_started_at)

        model_status = get_model_status()
        elapsed_ms = elapsed_ms_since(started_at)
        latency["total_ms"] = elapsed_ms

        search_id = save_search_with_latency(
            query=command_text,
            answer=answer,
            sources=[],
            model_name=model_status.get("selected_model"),
            elapsed_ms=elapsed_ms,
            latency=latency,
        )

        latency["total_ms"] = elapsed_ms_since(started_at)

        logger.info(
            "Command completed: id=%s mode=search-failed-local-fallback query=%s elapsed_ms=%s",
            search_id,
            command_text,
            latency["total_ms"],
        )

        return {
            "ok": True,
            "id": search_id,
            "mode": "search-failed-local-fallback",
            "question": command_text,
            "answer": answer,
            "sources": [],
            "debug": {
                "route": "search-failed-local-fallback",
                "original": original_text,
                "cleaned": command_text,
                "online": online,
                "forced_offline": forced_offline,
                "search": search_debug,
                "source_count": 0,
                "latency": latency,
                "resource_mode": get_resource_mode_status(),
                "model": model_status,
            },
        }

    ai_started_at = time.perf_counter()
    answer = summarize_search_results(command_text, results)
    latency["ai_ms"] = elapsed_ms_since(ai_started_at)

    model_status = get_model_status()
    elapsed_ms = elapsed_ms_since(started_at)
    latency["total_ms"] = elapsed_ms

    search_id = save_search_with_latency(
        query=command_text,
        answer=answer,
        sources=results,
        model_name=model_status.get("selected_model"),
        elapsed_ms=elapsed_ms,
        latency=latency,
    )

    latency["total_ms"] = elapsed_ms_since(started_at)

    logger.info(
        "Command completed: id=%s mode=online-search query=%s sources=%s elapsed_ms=%s",
        search_id,
        command_text,
        len(results),
        latency["total_ms"],
    )

    return {
        "ok": True,
        "id": search_id,
        "mode": "online-search",
        "question": command_text,
        "answer": answer,
        "sources": results,
        "debug": {
            "route": "online-search",
            "original": original_text,
            "cleaned": command_text,
            "online": online,
            "forced_offline": forced_offline,
            "search": search_debug,
            "source_count": len(results),
            "latency": latency,
            "resource_mode": get_resource_mode_status(),
            "model": model_status,
        },
    }
import shutil
from pathlib import Path

from app.config import ROOT_DIR


DATA_DIR = ROOT_DIR / "data"
TTS_CACHE_DIR = DATA_DIR / "tts"
VOICE_DOWNLOAD_CACHE_DIR = DATA_DIR / "voice-cache"
TEMP_AUDIO_CACHE_DIR = DATA_DIR / "temp-audio"


CACHE_TARGETS = {
    "tts": {
        "name": "TTS Cache",
        "path": TTS_CACHE_DIR,
        "description": "Generated Piper speech WAV files.",
    },
    "voices": {
        "name": "Voice Download Cache",
        "path": VOICE_DOWNLOAD_CACHE_DIR,
        "description": "Downloaded/import staging cache for voice packs.",
    },
    "temp_audio": {
        "name": "Temporary Audio Cache",
        "path": TEMP_AUDIO_CACHE_DIR,
        "description": "Temporary audio used for transcription.",
    },
}


def get_directory_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0

    if path.is_file():
        return path.stat().st_size

    total = 0

    for item in path.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue

    return total


def format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"

    size_kb = size_bytes / 1024

    if size_kb < 1024:
        return f"{size_kb:.2f} KB"

    size_mb = size_kb / 1024

    if size_mb < 1024:
        return f"{size_mb:.2f} MB"

    size_gb = size_mb / 1024
    return f"{size_gb:.2f} GB"


def get_cache_status() -> dict:
    caches = []

    for cache_id, target in CACHE_TARGETS.items():
        path = target["path"]
        size_bytes = get_directory_size_bytes(path)

        caches.append(
            {
                "id": cache_id,
                "name": target["name"],
                "description": target["description"],
                "path": str(path),
                "exists": path.exists(),
                "size_bytes": size_bytes,
                "size": format_size(size_bytes),
            }
        )

    total_bytes = sum(cache["size_bytes"] for cache in caches)

    return {
        "total_size_bytes": total_bytes,
        "total_size": format_size(total_bytes),
        "caches": caches,
    }


def clear_cache(cache_id: str) -> dict:
    if cache_id == "all":
        cleared = []

        for target_id in CACHE_TARGETS:
            cleared.append(clear_cache(target_id))

        return {
            "ok": True,
            "cleared": cleared,
            "status": get_cache_status(),
        }

    target = CACHE_TARGETS.get(cache_id)

    if target is None:
        raise ValueError(f"Unknown cache id: {cache_id}")

    path = target["path"]
    before_bytes = get_directory_size_bytes(path)

    if path.exists():
        shutil.rmtree(path)

    path.mkdir(parents=True, exist_ok=True)

    return {
        "ok": True,
        "id": cache_id,
        "name": target["name"],
        "cleared_bytes": before_bytes,
        "cleared": format_size(before_bytes),
    }
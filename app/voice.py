import json
from pathlib import Path

from app.config import VOICES_DIR
from app.storage import get_setting, set_setting


SUPPORTED_AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg"]
DEFAULT_VOICE_ID = "male1-genam"


def list_voices() -> list[dict]:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)

    voices: list[dict] = []

    for voice_json_path in sorted(VOICES_DIR.glob("*/voice.json")):
        try:
            with open(voice_json_path, "r", encoding="utf-8") as file:
                metadata = json.load(file)

            voice_id = metadata.get("id") or voice_json_path.parent.name

            voices.append(
                {
                    "id": voice_id,
                    "display_name": metadata.get("display_name", voice_id),
                    "type": metadata.get("type", "phrase-pack"),
                    "language": metadata.get("language", "unknown"),
                    "speaker": metadata.get("speaker", "unknown"),
                    "accent": metadata.get("accent", "unknown"),
                    "description": metadata.get("description", ""),
                    "version": metadata.get("version", "0.01"),
                    "enabled": bool(metadata.get("enabled", True)),
                    "phrase_count": len(list_voice_phrases(voice_id)),
                }
            )

        except Exception as error:
            voices.append(
                {
                    "id": voice_json_path.parent.name,
                    "display_name": voice_json_path.parent.name,
                    "type": "broken",
                    "enabled": False,
                    "error": str(error),
                    "phrase_count": 0,
                }
            )

    return voices


def get_selected_voice_id() -> str:
    return get_setting("selected_voice_id", DEFAULT_VOICE_ID) or DEFAULT_VOICE_ID


def set_selected_voice_id(voice_id: str) -> dict:
    voice_id = voice_id.strip()

    if not voice_id:
        return {
            "ok": False,
            "error": "Voice ID cannot be empty.",
        }

    voice_dir = VOICES_DIR / voice_id

    if not voice_dir.exists():
        return {
            "ok": False,
            "error": f"Voice does not exist: {voice_id}",
        }

    set_setting("selected_voice_id", voice_id)

    return {
        "ok": True,
        "selected_voice_id": voice_id,
    }


def list_voice_phrases(voice_id: str) -> list[dict]:
    wavs_dir = VOICES_DIR / voice_id / "wavs"

    if not wavs_dir.exists():
        return []

    phrases: list[dict] = []

    for file_path in sorted(wavs_dir.iterdir()):
        if file_path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
            continue

        phrases.append(
            {
                "id": file_path.stem,
                "filename": file_path.name,
                "extension": file_path.suffix.lower(),
                "size_bytes": file_path.stat().st_size,
            }
        )

    return phrases


def get_phrase_audio_path(voice_id: str, phrase_id: str) -> Path:
    voice_id = voice_id.strip()
    phrase_id = phrase_id.strip()

    if voice_id == "selected":
        voice_id = get_selected_voice_id()

    if not voice_id:
        raise ValueError("Voice ID cannot be empty.")

    if not phrase_id:
        raise ValueError("Phrase ID cannot be empty.")

    voice_dir = VOICES_DIR / voice_id
    wavs_dir = voice_dir / "wavs"

    if not voice_dir.exists():
        raise FileNotFoundError(f"Voice does not exist: {voice_id}")

    if not wavs_dir.exists():
        raise FileNotFoundError(f"Voice has no wavs folder: {voice_id}")

    for extension in SUPPORTED_AUDIO_EXTENSIONS:
        candidate = wavs_dir / f"{phrase_id}{extension}"

        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"Phrase does not exist: {phrase_id} for voice {voice_id}"
    )


def get_audio_media_type(path: Path) -> str:
    extension = path.suffix.lower()

    if extension == ".wav":
        return "audio/wav"

    if extension == ".mp3":
        return "audio/mpeg"

    if extension == ".ogg":
        return "audio/ogg"

    return "application/octet-stream"
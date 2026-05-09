from app.local_ai import get_model_status
from app.storage import get_setting, set_setting
from app.voice import list_voices, get_selected_voice_id


def is_setup_complete() -> bool:
    return get_setting("setup_complete", "false") == "true"


def set_setup_complete(value: bool) -> None:
    set_setting("setup_complete", "true" if value else "false")


def get_setup_status() -> dict:
    model_status = get_model_status()
    voices = list_voices()
    selected_voice_id = get_selected_voice_id()

    return {
        "setup_complete": is_setup_complete(),
        "model": model_status,
        "voices": voices,
        "selected_voice_id": selected_voice_id,
        "checks": {
            "has_model": bool(model_status.get("model_found")),
            "has_voices": len(voices) > 0,
        },
    }
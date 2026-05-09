from pathlib import Path

from app.storage import get_setting, set_setting


def is_low_resource_mode_enabled() -> bool:
    return get_setting("low_resource_mode", "false") == "true"


def set_low_resource_mode_enabled(enabled: bool) -> None:
    set_setting("low_resource_mode", "true" if enabled else "false")


def get_resource_mode_status() -> dict:
    return {
        "low_resource_mode": is_low_resource_mode_enabled(),
    }


def pick_smallest_model(models: list[dict]) -> dict | None:
    """
    Picks the smallest discovered model by size_bytes.

    This is used when low-resource mode is enabled and the selected model is auto.
    """
    if not models:
        return None

    return min(
        models,
        key=lambda model: int(model.get("size_bytes", 0) or 0),
    )


def should_prefer_smallest_model() -> bool:
    return is_low_resource_mode_enabled()
import keyring

from app.storage import get_setting, set_setting


SERVICE_NAME = "Voxel"


SUPPORTED_PROVIDERS = {
    "openai": {
        "id": "openai",
        "display_name": "OpenAI",
        "enabled_setting": "api_provider_openai_enabled",
    },
    "openrouter": {
        "id": "openrouter",
        "display_name": "OpenRouter",
        "enabled_setting": "api_provider_openrouter_enabled",
    },
    "gemini": {
        "id": "gemini",
        "display_name": "Google Gemini",
        "enabled_setting": "api_provider_gemini_enabled",
    },
}


def get_secret_account_name(provider_id: str) -> str:
    return f"api_key:{provider_id}"


def mask_key(value: str | None) -> str | None:
    if not value:
        return None

    if len(value) <= 8:
        return "*" * len(value)

    return f"{value[:4]}...{value[-4:]}"


def get_provider(provider_id: str) -> dict:
    provider = SUPPORTED_PROVIDERS.get(provider_id)

    if provider is None:
        raise ValueError(f"Unsupported provider: {provider_id}")

    return provider


def get_provider_key(provider_id: str) -> str | None:
    if provider_id not in SUPPORTED_PROVIDERS:
        return None

    account_name = get_secret_account_name(provider_id)

    try:
        key = keyring.get_password(SERVICE_NAME, account_name)
    except Exception:
        return None

    if not key:
        return None

    return key.strip() or None


def set_provider_key(provider_id: str, api_key: str) -> None:
    get_provider(provider_id)

    cleaned_key = api_key.strip()

    if not cleaned_key:
        raise ValueError("API key cannot be empty.")

    account_name = get_secret_account_name(provider_id)

    keyring.set_password(
        SERVICE_NAME,
        account_name,
        cleaned_key,
    )


def clear_provider_key(provider_id: str) -> None:
    provider = get_provider(provider_id)
    account_name = get_secret_account_name(provider_id)

    try:
        keyring.delete_password(SERVICE_NAME, account_name)
    except keyring.errors.PasswordDeleteError:
        pass

    set_setting(provider["enabled_setting"], "false")


def set_provider_enabled(provider_id: str, enabled: bool) -> None:
    provider = get_provider(provider_id)

    if enabled and not get_provider_key(provider_id):
        raise ValueError("Cannot enable provider without an API key.")

    set_setting(provider["enabled_setting"], "true" if enabled else "false")


def set_active_provider(provider_id: str) -> None:
    if provider_id != "local":
        get_provider(provider_id)

        if not get_provider_key(provider_id):
            raise ValueError("Cannot select provider without an API key.")

    set_setting("active_api_provider", provider_id)


def get_provider_status() -> dict:
    providers = []

    for provider in SUPPORTED_PROVIDERS.values():
        raw_key = get_provider_key(provider["id"])
        enabled = get_setting(provider["enabled_setting"], "false") == "true"

        providers.append(
            {
                "id": provider["id"],
                "display_name": provider["display_name"],
                "enabled": enabled,
                "has_key": bool(raw_key),
                "masked_key": mask_key(raw_key),
            }
        )

    active_provider = get_setting("active_api_provider", "local") or "local"

    return {
        "active_provider": active_provider,
        "secret_backend": str(keyring.get_keyring()),
        "providers": providers,
    }
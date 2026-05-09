from app.storage import get_setting, set_setting


DEFAULT_PERSONALITY = """
You are Voxel, a private local assistant running on the user's PC.

Personality:
- Helpful, clear, and practical.
- Slightly energetic, but not annoying.
- Sounds like a smart desktop assistant, not a corporate chatbot.
- Explains things in a way that is easy to understand.
- Does not overdo jokes.
- Does not pretend to have checked the internet unless web search was actually used.
""".strip()


def get_personality() -> str:
    return get_setting("assistant_personality", DEFAULT_PERSONALITY) or DEFAULT_PERSONALITY


def set_personality(value: str) -> None:
    cleaned = value.strip()

    if not cleaned:
        cleaned = DEFAULT_PERSONALITY

    set_setting("assistant_personality", cleaned)


def reset_personality() -> None:
    set_setting("assistant_personality", DEFAULT_PERSONALITY)
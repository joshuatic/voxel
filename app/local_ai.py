from pathlib import Path

from llama_cpp import Llama

from app.config import (
    MODELS_DIR,
    LOCAL_AI_CONTEXT_SIZE,
    LOCAL_AI_MAX_TOKENS,
    LOCAL_AI_TEMPERATURE,
)
from app.personality import get_personality

_llm: Llama | None = None
_loaded_model_path: Path | None = None
_selected_model_name: str = "auto"


def list_available_models() -> list[dict]:
    """
    Lists all GGUF models inside the models folder.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    models: list[dict] = []

    for path in sorted(MODELS_DIR.glob("*.gguf")):
        models.append(
            {
                "name": path.name,
                "path": str(path),
                "size_bytes": path.stat().st_size,
                "size_mb": round(path.stat().st_size / 1024 / 1024, 2),
            }
        )

    return models


def get_auto_model_path() -> Path | None:
    """
    Auto mode picks the first GGUF model in the models folder.
    """
    models = sorted(MODELS_DIR.glob("*.gguf"))

    if not models:
        return None

    return models[0]


def get_selected_model_path() -> Path | None:
    """
    Returns the path for the selected model.
    """
    if _selected_model_name == "auto":
        return get_auto_model_path()

    candidate = MODELS_DIR / _selected_model_name

    if candidate.exists() and candidate.suffix.lower() == ".gguf":
        return candidate

    return None


def set_selected_model(model_name: str) -> dict:
    """
    Selects which GGUF model Voxel should use.

    Passing "auto" makes Voxel pick the first GGUF file in models/.
    """
    global _llm
    global _loaded_model_path
    global _selected_model_name

    cleaned_name = model_name.strip()

    if not cleaned_name:
        cleaned_name = "auto"

    if cleaned_name != "auto":
        candidate = MODELS_DIR / cleaned_name

        if not candidate.exists():
            return {
                "ok": False,
                "message": f"Model does not exist: {cleaned_name}",
                "selected_model": _selected_model_name,
            }

        if candidate.suffix.lower() != ".gguf":
            return {
                "ok": False,
                "message": "Voxel only supports .gguf models right now.",
                "selected_model": _selected_model_name,
            }

    _selected_model_name = cleaned_name
    _llm = None
    _loaded_model_path = None

    return {
        "ok": True,
        "message": f"Selected model: {_selected_model_name}",
        "selected_model": _selected_model_name,
        "status": get_model_status(),
    }


def model_exists() -> bool:
    """
    Returns true if Voxel can find a usable GGUF model.
    """
    return get_selected_model_path() is not None


def get_model_status() -> dict:
    """
    Returns the currently selected/loaded local model status.

    This keeps other modules from needing to know local_ai.py internals.
    """
    model_path = get_selected_model_path()

    return {
        "model_found": model_path is not None,
        "selected_model": _selected_model_name,
        "model_path": str(model_path) if model_path else None,
        "loaded": _llm is not None,
        "loaded_model_path": str(_loaded_model_path) if _loaded_model_path else None,
        "available_models": list_available_models(),
    }


def get_llm() -> Llama:
    """
    Loads the selected GGUF model once and reuses it.
    """
    global _llm
    global _loaded_model_path

    model_path = get_selected_model_path()

    if model_path is None:
        raise FileNotFoundError(
            f"No usable GGUF model found in: {MODELS_DIR}. "
            "Place at least one .gguf model in the models folder."
        )

    if _llm is not None and _loaded_model_path == model_path:
        return _llm

    _loaded_model_path = model_path

    _llm = Llama(
        model_path=str(model_path),
        n_ctx=LOCAL_AI_CONTEXT_SIZE,
        verbose=False,
    )

    return _llm


def summarize_search_results(query: str, search_context: str, style: str = "normal") -> str:
    """
    Uses the local model to summarize web search results.
    """
    llm = get_llm()

    if style == "short":
        answer_style = "Keep the answer short. Use 1-2 small paragraphs."
        max_tokens = 350
    elif style == "long":
        answer_style = "Give a longer, more detailed answer. Use multiple paragraphs when helpful."
        max_tokens = 1000
    else:
        answer_style = "Give a clear medium-length answer."
        max_tokens = LOCAL_AI_MAX_TOKENS

    prompt = f"""
<|im_start|>system
{get_personality()}

Rules:
- Answer the user's question using ONLY the provided search results.
- Format answers in Markdown by default.
- Use short headings, bullets, and code blocks when helpful.
- Keep source citation numbers like [1], [2], or [3] when using search results.
- Be clear and useful.
- Be honest if the search results are not enough.
- Include source numbers like [1], [2], or [3].
- Do not invent facts.
- Answer style: {answer_style}
<|im_end|>
<|im_start|>user
{search_context}
<|im_end|>
<|im_start|>assistant
""".strip()

    response = llm(
        prompt,
        max_tokens=max_tokens,
        temperature=LOCAL_AI_TEMPERATURE,
        stop=["<|im_end|>", "<|im_start|>user"],
    )

    choices = response.get("choices", [])

    if not choices:
        return "Voxel could not generate an answer."

    return choices[0].get("text", "").strip()


def answer_locally(query: str, offline_reason: str = "local-only mode") -> str:
    """
    Uses the local model without web search.

    This is for offline mode or when the user chooses local-only answers.
    """
    llm = get_llm()

    prompt = f"""
<|im_start|>system
{get_personality()}

Current mode:
- {offline_reason}

Rules:
- Answer using your local model knowledge only.
- Format answers in Markdown by default.
- Use short headings, bullets, and code blocks when helpful.
- Keep source citation numbers like [1], [2], or [3] when using search results.
- Do not claim you checked the internet.
- Do not cite web sources.
- If the question needs current information, say that you cannot verify it right now because Voxel is offline or local-only.
- Be clear and useful.
- Keep the answer practical.
<|im_end|>
<|im_start|>user
{query}
<|im_end|>
<|im_start|>assistant
""".strip()

    response = llm(
        prompt,
        max_tokens=450,
        temperature=0.35,
        stop=["<|im_end|>", "<|im_start|>user"],
    )

    choices = response.get("choices", [])

    if not choices:
        return "Voxel could not generate a local answer."

    return choices[0].get("text", "").strip()
from pathlib import Path
import tempfile
import time

from faster_whisper import WhisperModel

_whisper_model: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    global _whisper_model

    if _whisper_model is not None:
        return _whisper_model

    started_at = time.perf_counter()

    _whisper_model = WhisperModel(
        "tiny.en",
        device="cpu",
        compute_type="int8",
        cpu_threads=4,
        num_workers=1,
    )

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    print(f"Whisper model loaded in {elapsed_ms}ms")

    return _whisper_model


def preload_whisper_model() -> None:
    get_whisper_model()


def transcribe_audio_bytes(audio_bytes: bytes, suffix: str = ".wav") -> dict:
    if not audio_bytes:
        raise ValueError("No audio data was provided.")

    if not suffix.startswith("."):
        suffix = f".{suffix}"

    model = get_whisper_model()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = Path(temp_file.name)

    started_at = time.perf_counter()

    try:
        segments, info = model.transcribe(
            str(temp_path),
            beam_size=1,
            best_of=1,
            vad_filter=False,
            condition_on_previous_text=False,
            temperature=0.0,
        )

        text_parts: list[str] = []

        for segment in segments:
            cleaned = segment.text.strip()

            if cleaned:
                text_parts.append(cleaned)

        text = " ".join(text_parts).strip()
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)

        return {
            "ok": True,
            "text": text,
            "language": info.language,
            "language_probability": info.language_probability,
            "elapsed_ms": elapsed_ms,
            "file_size_bytes": len(audio_bytes),
            "suffix": suffix,
        }

    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
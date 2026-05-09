import json
import subprocess
import time
from pathlib import Path

from app.config import ROOT_DIR, VOICES_DIR
from app.voice import get_selected_voice_id

DATA_DIR = ROOT_DIR / "data"
TTS_OUTPUT_DIR = DATA_DIR / "tts"


def load_voice_json(voice_id: str) -> dict:
    voice_json_path = VOICES_DIR / voice_id / "voice.json"

    if not voice_json_path.exists():
        raise FileNotFoundError(f"Missing voice.json for voice: {voice_id}")

    with open(voice_json_path, "r", encoding="utf-8") as file:
        return json.load(file)


def get_piper_paths(voice_id: str) -> tuple[Path, Path, dict]:
    if voice_id == "selected":
        voice_id = get_selected_voice_id()

    metadata = load_voice_json(voice_id)

    if metadata.get("type") != "piper":
        raise ValueError(f"Voice is not a Piper voice: {voice_id}")

    piper_files = metadata.get("files", {})

    model_relative = piper_files.get("piper_model", "piper/voice.onnx")
    config_relative = piper_files.get("piper_config", "piper/voice.onnx.json")

    voice_dir = VOICES_DIR / voice_id
    model_path = voice_dir / model_relative
    config_path = voice_dir / config_relative

    if not model_path.exists():
        raise FileNotFoundError(f"Missing Piper model: {model_path}")

    if not config_path.exists():
        raise FileNotFoundError(f"Missing Piper config: {config_path}")

    return model_path, config_path, metadata


def speak_to_file(text: str, voice_id: str = "selected") -> Path:
    cleaned_text = text.strip()

    if not cleaned_text:
        raise ValueError("Cannot speak empty text.")

    # Prevent accidentally sending a whole novel to Piper.
    if len(cleaned_text) > 4000:
        cleaned_text = cleaned_text[:4000]

    TTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model_path, config_path, metadata = get_piper_paths(voice_id)

    output_path = TTS_OUTPUT_DIR / f"voxel-tts-{int(time.time() * 1000)}.wav"

    command = [
        "piper",
        "-m",
        str(model_path),
        "-c",
        str(config_path),
        "-f",
        str(output_path),
    ]

    capabilities = metadata.get("capabilities", {})
    piper_settings = metadata.get("piper", {})

    if capabilities.get("multi_speaker"):
        command.extend(["-s", str(piper_settings.get("default_speaker", 0))])

    if "length_scale" in piper_settings:
        command.extend(["--length-scale", str(piper_settings["length_scale"])])

    if "noise_scale" in piper_settings:
        command.extend(["--noise-scale", str(piper_settings["noise_scale"])])

    if "noise_w_scale" in piper_settings:
        command.extend(["--noise-w-scale", str(piper_settings["noise_w_scale"])])

    process = subprocess.run(
        command,
        input=cleaned_text,
        text=True,
        capture_output=True,
    )

    if process.returncode != 0:
        raise RuntimeError(
            "Piper failed.\n"
            f"STDOUT: {process.stdout}\n"
            f"STDERR: {process.stderr}"
        )

    return output_path
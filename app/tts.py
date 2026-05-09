import json
import subprocess
import sys
import time
from pathlib import Path

from app.config import ROOT_DIR, VOICES_DIR
from app.voice import get_selected_voice_id

DATA_DIR = ROOT_DIR / "data"
TTS_OUTPUT_DIR = DATA_DIR / "tts"


def find_piper_executable() -> str:
    """
    Finds the Piper executable.

    Voxel usually runs through .venv/Scripts/python.exe, so the matching
    piper.exe is usually in the same Scripts folder. This also checks a
    repo-local tools folder for future portable builds.
    """
    executable_name = "piper.exe" if sys.platform.startswith("win") else "piper"

    candidates = [
        Path(sys.executable).parent / executable_name,
        ROOT_DIR / ".venv" / "Scripts" / executable_name,
        ROOT_DIR / ".venv" / "bin" / executable_name,
        ROOT_DIR / "tools" / "piper" / executable_name,
        Path.cwd() / ".venv" / "Scripts" / executable_name,
        Path.cwd() / ".venv" / "bin" / executable_name,
        Path.cwd() / "tools" / "piper" / executable_name,
    ]

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return str(candidate)

    # Final fallback: allow PATH lookup.
    return executable_name


def load_voice_json(voice_id: str) -> dict:
    """
    Loads a voice.json file for a Voxel voice.
    """
    voice_json_path = VOICES_DIR / voice_id / "voice.json"

    if not voice_json_path.exists():
        raise FileNotFoundError(f"Missing voice.json for voice: {voice_id}")

    with open(voice_json_path, "r", encoding="utf-8") as file:
        return json.load(file)


def get_piper_paths(voice_id: str) -> tuple[Path, Path, dict, str]:
    """
    Resolves Piper model/config paths for a voice.

    Returns:
        model_path, config_path, metadata, resolved_voice_id
    """
    resolved_voice_id = get_selected_voice_id() if voice_id == "selected" else voice_id

    metadata = load_voice_json(resolved_voice_id)

    if metadata.get("type") != "piper":
        raise ValueError(f"Voice is not a Piper voice: {resolved_voice_id}")

    piper_files = metadata.get("files", {})

    model_relative = piper_files.get("piper_model", "piper/voice.onnx")
    config_relative = piper_files.get("piper_config", "piper/voice.onnx.json")

    voice_dir = VOICES_DIR / resolved_voice_id
    model_path = voice_dir / model_relative
    config_path = voice_dir / config_relative

    if not model_path.exists():
        raise FileNotFoundError(f"Missing Piper model: {model_path}")

    if not config_path.exists():
        raise FileNotFoundError(f"Missing Piper config: {config_path}")

    return model_path, config_path, metadata, resolved_voice_id


def build_piper_command(
    *,
    piper_executable: str,
    model_path: Path,
    config_path: Path,
    output_path: Path,
    metadata: dict,
) -> list[str]:
    """
    Builds the Piper CLI command for the selected voice.
    """
    command = [
        piper_executable,
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

    return command


def speak_to_file(text: str, voice_id: str = "selected") -> Path:
    """
    Generates a WAV file using Piper and returns the output path.

    This function intentionally returns only the output Path so the existing
    /voice/speak endpoint can keep working without needing route changes.
    """
    cleaned_text = text.strip()

    if not cleaned_text:
        raise ValueError("Cannot speak empty text.")

    # Prevent accidentally sending a whole novel to Piper.
    if len(cleaned_text) > 4000:
        cleaned_text = cleaned_text[:4000]

    TTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model_path, config_path, metadata, resolved_voice_id = get_piper_paths(voice_id)

    output_path = TTS_OUTPUT_DIR / f"voxel-tts-{int(time.time() * 1000)}.wav"

    piper_executable = find_piper_executable()

    command = build_piper_command(
        piper_executable=piper_executable,
        model_path=model_path,
        config_path=config_path,
        output_path=output_path,
        metadata=metadata,
    )

    try:
        process = subprocess.run(
            command,
            input=cleaned_text,
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as error:
        raise FileNotFoundError(
            "Piper executable was not found. "
            f"Tried executable: {piper_executable}. "
            "Install Piper in the virtual environment or place piper.exe in tools/piper/."
        ) from error

    if process.returncode != 0:
        raise RuntimeError(
            "Piper failed.\n"
            f"Voice: {resolved_voice_id}\n"
            f"Executable: {piper_executable}\n"
            f"Model: {model_path}\n"
            f"Config: {config_path}\n"
            f"Output: {output_path}\n"
            f"STDOUT: {process.stdout}\n"
            f"STDERR: {process.stderr}"
        )

    if not output_path.exists():
        raise RuntimeError(
            "Piper finished without creating an output file.\n"
            f"Voice: {resolved_voice_id}\n"
            f"Executable: {piper_executable}\n"
            f"Output: {output_path}\n"
            f"STDOUT: {process.stdout}\n"
            f"STDERR: {process.stderr}"
        )

    return output_path
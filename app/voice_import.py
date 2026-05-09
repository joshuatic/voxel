import json
import shutil
import tempfile
import zipfile
from pathlib import Path

from app.config import VOICES_DIR


MAX_VOICE_ZIP_BYTES = 512 * 1024 * 1024
ALLOWED_SUFFIXES = {
    ".json",
    ".onnx",
    ".wav",
    ".mp3",
    ".ogg",
    ".opus",
    ".flac",
    ".txt",
    ".md",
}


def _is_safe_zip_member(member_name: str) -> bool:
    normalized = member_name.replace("\\", "/")

    if normalized.startswith("/"):
        return False

    if ":" in normalized:
        return False

    parts = Path(normalized).parts

    return ".." not in parts


def _validate_zip_members(zip_file: zipfile.ZipFile) -> None:
    for member in zip_file.infolist():
        if not _is_safe_zip_member(member.filename):
            raise ValueError(f"Unsafe path inside ZIP: {member.filename}")

        if member.is_dir():
            continue

        suffix = Path(member.filename).suffix.lower()

        if suffix not in ALLOWED_SUFFIXES:
            raise ValueError(f"Unsupported file type in ZIP: {member.filename}")


def _find_voice_root(extract_dir: Path) -> Path:
    direct_voice_json = extract_dir / "voice.json"

    if direct_voice_json.exists():
        return extract_dir

    child_dirs = [path for path in extract_dir.iterdir() if path.is_dir()]

    voice_dirs = [
        path
        for path in child_dirs
        if (path / "voice.json").exists()
    ]

    if len(voice_dirs) != 1:
        raise ValueError(
            "Voice ZIP must contain either voice.json at the root, "
            "or exactly one folder containing voice.json."
        )

    return voice_dirs[0]


def _load_voice_metadata(voice_root: Path) -> dict:
    voice_json_path = voice_root / "voice.json"

    if not voice_json_path.exists():
        raise ValueError("Missing voice.json.")

    try:
        with open(voice_json_path, "r", encoding="utf-8") as file:
            metadata = json.load(file)
    except json.JSONDecodeError as error:
        raise ValueError(f"voice.json is invalid JSON: {error}") from error

    voice_id = str(metadata.get("id", "")).strip()

    if not voice_id:
        raise ValueError("voice.json must contain a non-empty id field.")

    if "/" in voice_id or "\\" in voice_id or ".." in voice_id:
        raise ValueError("voice.json id contains unsafe path characters.")

    return metadata


def _validate_voice_files(voice_root: Path, metadata: dict) -> None:
    voice_type = metadata.get("type", "phrase-pack")

    if voice_type == "piper":
        files = metadata.get("files", {})
        model_relative = files.get("piper_model", "piper/voice.onnx")
        config_relative = files.get("piper_config", "piper/voice.onnx.json")

        if not (voice_root / model_relative).exists():
            raise ValueError(f"Missing Piper model file: {model_relative}")

        if not (voice_root / config_relative).exists():
            raise ValueError(f"Missing Piper config file: {config_relative}")

    if voice_type == "phrase-pack":
        has_wavs = (voice_root / "wavs").exists()
        has_phrases = (voice_root / "phrases").exists()

        if not has_wavs and not has_phrases:
            raise ValueError("Phrase pack voice must contain wavs/ or phrases/.")


def import_voice_zip(zip_bytes: bytes) -> dict:
    if not zip_bytes:
        raise ValueError("No ZIP data was provided.")

    if len(zip_bytes) > MAX_VOICE_ZIP_BYTES:
        raise ValueError("Voice ZIP is too large.")

    VOICES_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir_text:
        temp_dir = Path(temp_dir_text)
        zip_path = temp_dir / "voice-pack.zip"
        extract_dir = temp_dir / "extract"

        zip_path.write_bytes(zip_bytes)
        extract_dir.mkdir(parents=True, exist_ok=True)

        if not zipfile.is_zipfile(zip_path):
            raise ValueError("Uploaded file is not a valid ZIP archive.")

        with zipfile.ZipFile(zip_path, "r") as archive:
            _validate_zip_members(archive)
            archive.extractall(extract_dir)

        voice_root = _find_voice_root(extract_dir)
        metadata = _load_voice_metadata(voice_root)
        _validate_voice_files(voice_root, metadata)

        voice_id = str(metadata["id"]).strip()
        destination = VOICES_DIR / voice_id

        if destination.exists():
            raise FileExistsError(
                f"Voice already exists: {voice_id}. Delete it first or rename the voice id."
            )

        shutil.copytree(voice_root, destination)

        return {
            "ok": True,
            "voice_id": voice_id,
            "display_name": metadata.get("display_name", voice_id),
            "type": metadata.get("type", "unknown"),
            "message": f"Imported voice: {voice_id}",
        }
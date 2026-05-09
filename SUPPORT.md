# Support

<img src="assets/voxel.png" alt="Voxel logo" width="1024">

## Getting help

- Open a GitHub issue using the **Support Question** template.
- Include your OS, Python version, and relevant logs/error messages.
- Share reproduction steps when possible.

## Common setup checks

- Confirm dependencies are installed from `requirements.txt`.
- Confirm at least one `.gguf` model exists in `models/`.
- Confirm `piper` is available in PATH for TTS.
- If transcription fails due to decoding, install FFmpeg/`av` and retry.

## Logs and diagnostics

- Current run log: `logs/latest.log`
- Older logs: `logs/voxel-*.log.gz`

When reporting issues, include the smallest relevant log snippet.

# Changelog

All notable changes to Voxel will be documented in this file.

Voxel follows early preview versioning while the project is still experimental.

---

## v0.02 – In Development

### Added

- Added a basic tool/plugin registry foundation.
- Added a built-in calculator tool.
- Added support for constants and scientific math in the calculator tool, including `pi`, `e`, `sqrt()`, `sin()`, `cos()`, `tan()`, `ln()`, and more.
- Added a built-in small talk tool for simple assistant interactions.
- Added a built-in local time/date tool.
- Added command routing so tools can run before web search or local AI.
- Added latency breakdowns for routing, tools, network checks, search, AI generation, and storage.
- Added an improved visual debug panel.
- Added Low Resource Mode.
- Added TTS barge-in interruption.
- Added smarter `run.ps1` setup behavior.
- Added automatic random port selection from the `87xx` port family.
- Added first-run setup flow groundwork.
- Added Piper executable discovery for virtual environment installs.

### Changed

- Updated command routing to avoid unnecessary web searches for tool-supported requests.
- Updated frontend request status text so tool requests no longer appear as web searches.
- Updated TTS text cleanup so Markdown syntax is not read aloud.
- Updated debug output to show route, mode, tool, source count, and model status more clearly.
- Updated `run.ps1` to behave more like a setup-aware launcher.

### Fixed

- Fixed calculator requests like `pi x 3 + 88` incorrectly falling through to web search.
- Fixed small talk prompts like `what's up` being treated as search queries.
- Fixed time prompts like `what time is it` routing through web search.
- Fixed TTS failing when `piper.exe` existed inside `.venv/Scripts` but was not found through PATH.
- Fixed repeated TTS generation attempts causing multiple backend errors.
- Fixed citation/Markdown characters being read aloud by TTS.

### Notes

v0.02 focuses on making Voxel more modular, easier to debug, easier to launch, and better suited for lower-resource machines.

---

## v0.01 – Initial Preview

### Added

- Added FastAPI backend.
- Added a browser-based dashboard.
- Added local GGUF model support.
- Added offline/local response mode.
- Added online search plus local AI summarization.
- Added Piper TTS support.
- Added Whisper push-to-talk transcription.
- Added voice selection.
- Added custom voice pack import from ZIP files.
- Added API key storage through the operating system credential vault.
- Added custom personality settings.
- Added cache management.
- Added Markdown and raw answer display modes.
- Added SQLite-backed search history and settings.

### Notes

v0.01 was the first public developer preview of Voxel.
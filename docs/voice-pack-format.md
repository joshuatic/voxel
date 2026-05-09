# Voxel Voice Pack Format

A Voxel voice pack is a ZIP containing one folder with a `voice.json`.

## Piper Voice *(PREFERRED)*

```txt
voice-id/
├── voice.json
└── piper/
    ├── voice.onnx
    └── voice.onnx.json
```

## Phrase Pack Voice
```txt
voice-id/
├── voice.json
└── wavs/
    ├── searching.wav
    ├── reading.wav
    ├── thinking.wav
    ├── complete.wav
    └── error.wav
```

## Required voice.json fields

```json
{
  "id": "my-voice-id",
  "display_name": "My Voice",
  "type": "piper",
  "language": "en-US",
  "enabled": true,
  "files": {
    "piper_model": "piper/voice.onnx",
    "piper_config": "piper/voice.onnx.json"
  }
}
```
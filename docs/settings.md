# Voxel Settings

Voxel stores user settings locally.

Most settings are saved in SQLite. API keys are not stored in SQLite; they are stored through the operating system credential vault using `keyring`.

## Local Settings

Settings are managed through:

```txt
app/storage.py
```

Common setting examples:
```
setup_complete
assistant_personality
selected_voice_id
active_api_provider
low_resource_mode
```

## API Keys
API keys are stored through the OS secret store:
```txt
Windows Credential Manager
macOS Keychain
Linux Secret Service / keyring
```
Voxel uses `app/api_keys.py`. The API key status endpoint returns ONLY masked keys.
```json
{
  "has_key": true,
  "masked_key": "test...7890"
}
```
Raw API keys should NEVER be written to logs, debug JSON, or SQLite.

## Low Resource Mode
Low Resource Mode is designed for smaller machines.

When enabled, voxel can:
- Skip Whisper Preload
- Disable auto-speak on search
- Prefer smaller local models when model selection is set to auto
- Show resource mode state in debug output

Endpoint:
```
GET /resource-mode/status
POST /resource-mode/set
```
Debug output includes:
```json
"resource_mode": {
  "low_resource_mode": true
}
```

## Setup State
Initial setup is tracked with `setup_complete`.

Endpoints:
```
GET /setup/status
POST /setup/complete
POST /setup/reset
```

## Frontend Settings
Some UI behavior is stored in browser `localStorage`.

Examples:
```
voxel.settings
voxel.answerRenderMode
```
These settings affect dashboard behavior, not backend state.

## Important rule
Settings should be split like this:
```txt
Security-sensitive secrets → OS credential vault
Persistent app state → SQLite
Frontend-only preferences → localStorage
Generated files/cache → data/
```
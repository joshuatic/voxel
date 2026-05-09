from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

MODELS_DIR = ROOT_DIR / "models"
STATIC_DIR = ROOT_DIR / "static"

APP_NAME = "Voxel"
APP_VERSION = "0.01"

SEARCH_RESULT_LIMIT = 6

LOCAL_AI_CONTEXT_SIZE = 8192
LOCAL_AI_MAX_TOKENS = 850
LOCAL_AI_TEMPERATURE = 0.25

DEFAULT_MODEL_NAME = "auto"

VOICES_DIR = ROOT_DIR / "voices"
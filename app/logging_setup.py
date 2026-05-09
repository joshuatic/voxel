import gzip
import logging
import shutil
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "logs"

LATEST_LOG = LOG_DIR / "latest.log"


def setup_logging() -> None:
    """
    Configures Voxel logging.

    Voxel always writes to:
    - logs/latest.log

    When Voxel starts, the previous latest.log is compressed into:
    - logs/voxel-YYYY-MM-DD_HH-MM-SS.log.gz
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    rotate_latest_log()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(LATEST_LOG, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )

    logging.getLogger("voxel").info("Voxel logging initialized.")


def rotate_latest_log() -> None:
    if not LATEST_LOG.exists():
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    compressed_path = LOG_DIR / f"voxel-{timestamp}.log.gz"

    with open(LATEST_LOG, "rb") as source:
        with gzip.open(compressed_path, "wb") as target:
            shutil.copyfileobj(source, target)

    LATEST_LOG.unlink()
import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DATABASE_PATH = DATA_DIR / "voxel.db"


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    return connection


def initialize_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                answer TEXT NOT NULL,
                source_count INTEGER NOT NULL DEFAULT 0,
                model_name TEXT,
                elapsed_ms INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS search_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id INTEGER NOT NULL,
                title TEXT,
                url TEXT,
                snippet TEXT,
                source_index INTEGER NOT NULL,
                FOREIGN KEY(search_id) REFERENCES searches(id)
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS memories
            (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                content     TEXT    NOT NULL,
                memory_type TEXT    NOT NULL DEFAULT 'note',
                source      TEXT    NOT NULL DEFAULT 'user',
                enabled     INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT    NOT NULL,
                updated_at  TEXT    NOT NULL
            )
            """
        )

        connection.commit()

def save_search(
    query: str,
    answer: str,
    sources: list[dict],
    model_name: str | None,
    elapsed_ms: int,
) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO searches (query, answer, source_count, model_name, elapsed_ms)
            VALUES (?, ?, ?, ?, ?)
            """,
            (query, answer, len(sources), model_name, elapsed_ms),
        )

        search_id = int(cursor.lastrowid)

        for index, source in enumerate(sources, start=1):
            connection.execute(
                """
                INSERT INTO search_sources (search_id, title, url, snippet, source_index)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    search_id,
                    source.get("title", ""),
                    source.get("url", ""),
                    source.get("snippet", ""),
                    index,
                ),
            )

        return search_id


def get_recent_searches(limit: int = 10) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, query, answer, source_count, model_name, elapsed_ms, created_at
            FROM searches
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


def get_suggested_prompts(limit: int = 6) -> list[str]:
    """
    Makes simple personalized suggestions from recent searches.

    This is intentionally basic:
    - Pull recent search queries.
    - Prefer repeated or recent topics.
    - Fall back to starter prompts if there is not enough history.
    """
    recent = get_recent_searches(limit=30)

    if not recent:
        return [
            "Python programming language",
            "What is Minecraft?",
            "Latest Windows 11 update",
            "What is Vulkan graphics API?",
        ]

    suggestions: list[str] = []
    seen: set[str] = set()

    for item in recent:
        query = item["query"].strip()

        if not query:
            continue

        normalized = query.lower()

        if normalized in seen:
            continue

        seen.add(normalized)
        suggestions.append(query)

        if len(suggestions) >= limit:
            break

    return suggestions

def set_setting(key: str, value: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )

        connection.commit()


def get_setting(key: str, default: str | None = None) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT value
            FROM settings
            WHERE key = ?
            """,
            (key,),
        ).fetchone()

    if row is None:
        return default

    return str(row["value"])

def clear_search_history() -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM search_sources")
        connection.execute("DELETE FROM searches")
        connection.commit()
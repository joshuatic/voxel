from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.storage import get_connection


def utc_now_text() -> str:
    """
    Returns a stable UTC timestamp for SQLite storage.
    """
    return datetime.now(timezone.utc).isoformat()


def create_memory(
    content: str,
    memory_type: str = "note",
    source: str = "user",
    enabled: bool = True,
) -> dict[str, Any]:
    """
    Creates a local memory record.

    This does not automatically inject memory into prompts yet.
    It only stores the memory safely in the local SQLite database.
    """
    cleaned_content = content.strip()
    cleaned_type = memory_type.strip() or "note"
    cleaned_source = source.strip() or "user"

    if not cleaned_content:
        raise ValueError("Memory content cannot be empty.")

    now = utc_now_text()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO memories (
                content,
                memory_type,
                source,
                enabled,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                cleaned_content,
                cleaned_type,
                cleaned_source,
                1 if enabled else 0,
                now,
                now,
            ),
        )

        connection.commit()

        memory_id = int(cursor.lastrowid)

    return get_memory(memory_id)


def get_memory(memory_id: int) -> dict[str, Any]:
    """
    Returns one memory by id.
    """
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                content,
                memory_type,
                source,
                enabled,
                created_at,
                updated_at
            FROM memories
            WHERE id = ?
            """,
            (memory_id,),
        ).fetchone()

    if row is None:
        raise ValueError(f"Memory not found: {memory_id}")

    return row_to_memory(row)


def list_memories(
    include_disabled: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """
    Lists stored memories, newest first.
    """
    safe_limit = max(1, min(int(limit), 500))

    query = """
        SELECT
            id,
            content,
            memory_type,
            source,
            enabled,
            created_at,
            updated_at
        FROM memories
    """

    params: list[Any] = []

    if not include_disabled:
        query += " WHERE enabled = 1"

    query += " ORDER BY updated_at DESC, id DESC LIMIT ?"
    params.append(safe_limit)

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [row_to_memory(row) for row in rows]


def search_memories(
    query: str,
    include_disabled: bool = False,
    limit: int = 25,
) -> list[dict[str, Any]]:
    """
    Performs a simple keyword search over memory content.

    This is not semantic search yet. It is the v0.02 foundation.
    """
    cleaned_query = query.strip()

    if not cleaned_query:
        return []

    safe_limit = max(1, min(int(limit), 100))
    like_query = f"%{cleaned_query}%"

    sql = """
        SELECT
            id,
            content,
            memory_type,
            source,
            enabled,
            created_at,
            updated_at
        FROM memories
        WHERE content LIKE ?
    """

    params: list[Any] = [like_query]

    if not include_disabled:
        sql += " AND enabled = 1"

    sql += " ORDER BY updated_at DESC, id DESC LIMIT ?"
    params.append(safe_limit)

    with get_connection() as connection:
        rows = connection.execute(sql, params).fetchall()

    return [row_to_memory(row) for row in rows]


def set_memory_enabled(memory_id: int, enabled: bool) -> dict[str, Any]:
    """
    Enables or disables a memory without deleting it.
    """
    now = utc_now_text()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE memories
            SET enabled = ?, updated_at = ?
            WHERE id = ?
            """,
            (1 if enabled else 0, now, memory_id),
        )

        connection.commit()

        if cursor.rowcount == 0:
            raise ValueError(f"Memory not found: {memory_id}")

    return get_memory(memory_id)


def delete_memory(memory_id: int) -> dict[str, Any]:
    """
    Deletes a memory permanently.
    """
    memory = get_memory(memory_id)

    with get_connection() as connection:
        connection.execute(
            """
            DELETE FROM memories
            WHERE id = ?
            """,
            (memory_id,),
        )

        connection.commit()

    return memory


def clear_memories() -> int:
    """
    Deletes all memories.

    This is intentionally separate from cache clearing.
    """
    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM memories
            """
        )

        connection.commit()

        return int(cursor.rowcount)


def row_to_memory(row) -> dict[str, Any]:
    """
    Converts a SQLite row into a JSON-safe memory dictionary.
    """
    return {
        "id": int(row["id"]),
        "content": str(row["content"]),
        "memory_type": str(row["memory_type"]),
        "source": str(row["source"]),
        "enabled": bool(row["enabled"]),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }
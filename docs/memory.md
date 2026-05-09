# Voxel Memory

Voxel memory is planned for v0.02, but is not fully implemented yet.

The goal is to let users store approved memories locally so Voxel can remember useful project context without relying on cloud storage.

## Goals

Voxel memory should be:

- Local-first
- User-controlled
- Easy to view
- Easy to delete
- Private by default
- Searchable

## Planned Memory Types

Possible future memory types:

```txt
project_preference
user_preference
assistant_instruction
technical_context
note
```
Examples:
```txt
User prefers local-first answers.
User's project is named Voxel.
Voxel should avoid auto-speaking when Low Resource Mode is enabled.
```

## Planned Database Table
Possible SQLite Structure:
```sqlite
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL DEFAULT 'note',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
);
```
## Planned Features
### Memory Storage
Users should be able to explicitly save memories.

Example commands:
```txt
remember that voxel is local-first
save this as a memory
```
### Memory View/Delete UI
Settings should include a memory panel where users can:
- View memories
- Disable memories
- Delete memories
- Clear All memories
- 
### Basic Memory Search
v0.02 can start with keyword search.

Future versions may add semantic search with embeddings.

### Non-Goals for Initial Memory
The first memory system should not include
- Cloud sync
- Invisible memory storage
- Multi-user memory
- Automatic sensitive data storage
- Full document RAG

## Privacy Rule
Voxel should not silently store sensitive information. Memory should be user-approved and easy to remove.
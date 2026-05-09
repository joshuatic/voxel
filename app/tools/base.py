from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ToolResult:
    """
    Standard result returned by all Voxel tools.

    Tools should not directly return random dictionaries because the command
    router needs one predictable shape to work with.
    """

    ok: bool
    tool_id: str
    title: str
    content: str
    debug: dict | None = None


class VoxelTool(Protocol):
    """
    Protocol for a Voxel tool.

    A tool can decide whether it should handle a user query, then return a
    ToolResult when executed.
    """

    id: str
    name: str
    description: str

    def can_handle(self, query: str) -> bool:
        """
        Return True when this tool should handle the query.
        """
        ...

    def run(self, query: str) -> ToolResult:
        """
        Execute the tool and return a structured result.
        """
        ...
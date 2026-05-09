import time

from app.tools.base import ToolResult, VoxelTool
from app.tools.builtin.calculator import CalculatorTool
from app.tools.builtin.small_talk import SmallTalkTool
from app.tools.builtin.time_tool import TimeTool


_TOOLS: list[VoxelTool] = [
    SmallTalkTool(),
    TimeTool(),
    CalculatorTool(),
]


def list_tools() -> list[dict]:
    return [
        {
            "id": tool.id,
            "name": tool.name,
            "description": tool.description,
        }
        for tool in _TOOLS
    ]


def find_tool_for_query(query: str) -> VoxelTool | None:
    for tool in _TOOLS:
        if tool.can_handle(query):
            return tool

    return None


def run_tool_if_available(query: str) -> ToolResult | None:
    tool = find_tool_for_query(query)

    if tool is None:
        return None

    started_at = time.perf_counter()
    result = tool.run(query)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)

    debug = result.debug or {}
    debug["latency_ms"] = elapsed_ms
    debug["tool_name"] = tool.name

    return ToolResult(
        ok=result.ok,
        tool_id=result.tool_id,
        title=result.title,
        content=result.content,
        debug=debug,
    )
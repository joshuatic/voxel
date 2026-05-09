# Voxel Tools

Voxel tools are local command handlers that can answer certain requests without using web search or AI generation.

Tools run before web search and before local AI fallback. This keeps common requests fast, private, and predictable.

## Current Built-in Tools

### Calculator

Handles local math expressions.

Examples:

```txt
1+1
calc 2^8
calculate 144 / 12
pi x 3 + 88
sqrt(144)
sin(pi / 2)
ln(e)
```
Calculator requests return with:
```json
{
  "mode": "tool",
  "tool": "calculator"
}
```

### Small Talk
Handles basic assistant interactions.

Examples:

```txt
hi
whats up
who are you
what can you do
thanks
bye
```
Small talk requests return with:
```json
{
  "mode": "tool",
  "tool": "small_talk"
}
```

### Time
Handles local time and date requests.

Examples:
```txt
what time is it
whats the time
date
today
what day is it
```
Time requests return with:
```json
{
  "mode": "tool",
  "tool": "time"
}
```

### Tool Routing Order
Voxel checks tools before web search:
```txt
user input
→ activation word cleanup
→ mode prefix cleanup
→ tool registry
→ offline/local mode
→ online search
→ local AI summarizer
```
This means tool-supported prompts don't hit the internet.

### Tool Result Format
Every tool returns a standard result:
```python
ToolResult(
    ok=True,
    tool_id="calculator",
    title="Calculator",
    content="`1+1` = **2**",
    debug={}
)
```
### Adding a new tool
Create a file in:
`app/tools/builtin/`
Example:
`app/tools/builtin/system_info.py`

A tool should implement:
```python
class MyTool:
    id = "my_tool"
    name = "My Tool"
    description = "What this tool does."

    def can_handle(self, query: str) -> bool:
        return False

    def run(self, query: str) -> ToolResult:
        ...
```
Then register it in `app/tools/registry.py`

Add it to the tool list
```python
_TOOLS = [
    SmallTalkTool(),
    TimeTool(),
    CalculatorTool(),
    MyTool(),
]
```
Tool **order DOES matter**. More specific tools should come before broad or less specific tools.
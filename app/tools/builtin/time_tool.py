from datetime import datetime

from app.tools.base import ToolResult


class TimeTool:
    id = "time"
    name = "Time"
    description = "Returns the local system time and date."

    def can_handle(self, query: str) -> bool:
        cleaned = query.strip().lower().replace("’", "'").strip(" .!?")
        cleaned = cleaned.replace("what's", "whats")

        exact_matches = {
            "time",
            "date",
            "today",
            "what time is it",
            "whats the time",
            "what is the time",
            "current time",
            "local time",
            "what day is it",
            "whats today",
            "what is today",
            "what is todays date",
            "whats todays date",
            "what is today's date",
            "whats today's date",
        }

        if cleaned in exact_matches:
            return True

        time_phrases = [
            "tell me the time",
            "tell me what time it is",
            "give me the time",
            "show me the time",
        ]

        return cleaned in time_phrases

    def run(self, query: str) -> ToolResult:
        now = datetime.now().astimezone()

        time_text = now.strftime("%I:%M %p").lstrip("0")
        date_text = now.strftime("%A, %B %d, %Y")
        timezone_text = now.tzname() or "local time"

        content = f"It is **{time_text}** on **{date_text}** ({timezone_text})."

        return ToolResult(
            ok=True,
            tool_id=self.id,
            title="Time",
            content=content,
            debug={
                "iso": now.isoformat(),
                "time": time_text,
                "date": date_text,
                "timezone": timezone_text,
            },
        )
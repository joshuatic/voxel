import random
import re

from app.tools.base import ToolResult


class SmallTalkTool:
    id = "small_talk"
    name = "Small Talk"
    description = "Handles basic assistant conversation without web search."

    def can_handle(self, query: str) -> bool:
        cleaned = self._clean(query)

        patterns = [
            r"^(hi|hello|hey|yo|sup|hey voxel|hi voxel)$",
            r"^(what'?s up|whats up|wyd|what are you doing)$",
            r"^(who are you|what are you)$",
            r"^(what can you do|help|commands)$",
            r"^(thanks|thank you|thx)$",
            r"^(bye|goodbye|see you)$",
        ]

        return any(re.fullmatch(pattern, cleaned) for pattern in patterns)

    def run(self, query: str) -> ToolResult:
        cleaned = self._clean(query)

        if re.fullmatch(r"^(hi|hello|hey|yo|sup|hey voxel|hi voxel)$", cleaned):
            answer = random.choice(
                [
                    "Hey. Voxel is online.",
                    "Yo. I’m ready.",
                    "Hey, what are we building today?",
                ]
            )

        elif re.fullmatch(r"^(what'?s up|whats up|wyd|what are you doing)$", cleaned):
            answer = "Not much. I’m running locally and waiting for your next command."

        elif re.fullmatch(r"^(who are you|what are you)$", cleaned):
            answer = (
                "I’m Voxel, a local-first AI assistant running on your machine. "
                "I can use local models, tools, voice input, and local text-to-speech."
            )

        elif re.fullmatch(r"^(what can you do|help|commands)$", cleaned):
            answer = (
                "I can answer questions, run local tools like calculator and time, "
                "use local AI, search when online, speak answers, transcribe voice input, "
                "and use custom voices."
            )

        elif re.fullmatch(r"^(thanks|thank you|thx)$", cleaned):
            answer = random.choice(
                [
                    "No problem.",
                    "Anytime.",
                    "Got you.",
                ]
            )

        elif re.fullmatch(r"^(bye|goodbye|see you)$", cleaned):
            answer = "See you. Voxel will be here when you need it."

        else:
            answer = "I’m here."

        return ToolResult(
            ok=True,
            tool_id=self.id,
            title="Small Talk",
            content=answer,
            debug={
                "matched_text": cleaned,
            },
        )

    def _clean(self, query: str) -> str:
        return query.strip().lower().replace("’", "'").strip(" .!?")
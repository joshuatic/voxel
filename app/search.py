from ddgs import DDGS

from app.config import SEARCH_RESULT_LIMIT


def search_web(query: str) -> dict:
    """
    Searches the web and returns:
    - ok
    - query
    - results
    - debug info

    This version returns debug JSON so we can actually see what failed.
    """
    cleaned_query = query.strip()

    if not cleaned_query:
        return {
            "ok": False,
            "query": query,
            "results": [],
            "debug": {
                "reason": "empty_query",
            },
        }

    results: list[dict] = []

    try:
        with DDGS() as ddgs:
            raw_results = ddgs.text(
                cleaned_query,
                region="us-en",
                safesearch="moderate",
                timelimit=None,
                max_results=SEARCH_RESULT_LIMIT,
            )

            for result in raw_results:
                title = result.get("title") or "Untitled"
                url = result.get("href") or result.get("url") or ""
                snippet = result.get("body") or result.get("snippet") or ""

                if not title and not url and not snippet:
                    continue

                results.append(
                    {
                        "title": title,
                        "url": url,
                        "snippet": snippet,
                    }
                )

    except Exception as error:
        return {
            "ok": False,
            "query": cleaned_query,
            "results": [],
            "debug": {
                "reason": "search_exception",
                "error": str(error),
                "error_type": type(error).__name__,
            },
        }

    return {
        "ok": len(results) > 0,
        "query": cleaned_query,
        "results": results,
        "debug": {
            "result_count": len(results),
            "limit": SEARCH_RESULT_LIMIT,
        },
    }


def format_results_for_ai(query: str, results: list[dict]) -> str:
    """
    Converts search results into compact context for the local AI.
    """
    lines: list[str] = []

    lines.append(f"User question: {query}")
    lines.append("")
    lines.append("Search results:")

    for index, result in enumerate(results, start=1):
        lines.append("")
        lines.append(f"[{index}] {result['title']}")
        lines.append(f"URL: {result['url']}")
        lines.append(f"Snippet: {result['snippet']}")

    return "\n".join(lines)
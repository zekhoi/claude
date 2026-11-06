"""Text helpers that currently live in the app."""


def truncate(text: str, limit: int) -> str:
    """Shorten text to limit characters, adding an ellipsis."""
    return text if len(text) <= limit else text[: limit - 1] + "…"

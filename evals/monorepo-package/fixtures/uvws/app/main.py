from app.text import truncate
from acme_core import new_id


def label(title: str) -> str:
    return f"{new_id('doc')}: {truncate(title, 20)}"

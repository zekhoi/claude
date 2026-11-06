import uuid


def new_id(prefix: str) -> str:
    """Return a prefixed random id."""
    return f"{prefix}_{uuid.uuid4().hex}"

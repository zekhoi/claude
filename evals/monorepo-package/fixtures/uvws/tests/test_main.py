from app.main import label


def test_label_truncates() -> None:
    assert label("a" * 30).endswith("…")

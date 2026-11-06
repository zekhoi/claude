from acme_core import new_id


def test_new_id_has_prefix() -> None:
    assert new_id("ord").startswith("ord_")

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_get_user() -> None:
    response = client.get("/users/1")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "email": "ada@example.com", "active": True}


def test_get_missing_user() -> None:
    assert client.get("/users/99").status_code == 404

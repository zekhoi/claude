from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

router = APIRouter(prefix="/users", tags=["users"])


class UserRead(BaseModel):
    id: int
    email: str
    active: bool


USERS: dict[int, dict] = {
    1: {"id": 1, "email": "ada@example.com", "active": True, "password_hash": "x1"},
    2: {"id": 2, "email": "alan@example.com", "active": True, "password_hash": "x2"},
}


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: Annotated[int, Path(gt=0)]) -> dict:
    user = USERS.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

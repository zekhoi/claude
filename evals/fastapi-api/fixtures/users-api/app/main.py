from fastapi import FastAPI

from app.routes import users


def create_app() -> FastAPI:
    app = FastAPI()
    app.include_router(users.router)
    return app


app = create_app()

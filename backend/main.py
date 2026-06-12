import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import wins, config, bonus, tasks, ai

app = FastAPI(title="Learning Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(wins.router)
app.include_router(config.router)
app.include_router(bonus.router)
app.include_router(tasks.router)
app.include_router(ai.router)

@app.get("/health")
def health():
    return {"status": "ok"}

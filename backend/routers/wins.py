from datetime import datetime
from typing import Literal
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.records import load_wins, append_win, delete_win, save_wins

router = APIRouter(prefix="/wins", tags=["wins"])

WinLevel = Literal["small", "medium", "big", "future"]
STARS = {"small": 1, "medium": 2, "big": 3, "future": 0}


class WinCreate(BaseModel):
    content: str
    win_level: WinLevel


class Win(BaseModel):
    id: str
    content: str
    win_level: WinLevel
    stars: int
    created_at: str


def _ensure_ids() -> None:
    """旧数据没有 id 字段时，补上。"""
    wins = load_wins()
    changed = False
    for w in wins:
        if "id" not in w:
            w["id"] = str(uuid.uuid4())
            changed = True
    if changed:
        save_wins(wins)


@router.get("/", response_model=list[Win])
def list_wins():
    _ensure_ids()
    return load_wins()


@router.get("/by-date", response_model=dict[str, list[Win]])
def wins_by_date():
    _ensure_ids()
    wins = load_wins()
    grouped: dict[str, list] = {}
    for w in wins:
        day = w["created_at"][:10]
        grouped.setdefault(day, []).append(w)
    return grouped


@router.get("/date/{day}", response_model=list[Win])
def wins_for_date(day: str):
    _ensure_ids()
    wins = load_wins()
    return [w for w in wins if w["created_at"][:10] == day]


@router.post("/", response_model=Win, status_code=201)
def create_win(body: WinCreate):
    win = {
        "id": str(uuid.uuid4()),
        "content": body.content,
        "win_level": body.win_level,
        "stars": STARS[body.win_level],
        "created_at": datetime.now().isoformat(),
    }
    append_win(win)
    return win


@router.delete("/{win_id}", status_code=204)
def remove_win(win_id: str):
    if not delete_win(win_id):
        raise HTTPException(status_code=404, detail="记录不存在")


@router.get("/stats")
def win_stats(start: str | None = None, end: str | None = None):
    wins = load_wins()
    if start:
        wins = [w for w in wins if w["created_at"][:10] >= start]
    if end:
        wins = [w for w in wins if w["created_at"][:10] <= end]

    total = len(wins)
    total_stars = sum(w["stars"] for w in wins)
    by_day: dict[str, int] = {}
    for w in wins:
        day = w["created_at"][:10]
        by_day[day] = by_day.get(day, 0) + w["stars"]
    by_level = {"small": 0, "medium": 0, "big": 0, "future": 0}
    for w in wins:
        by_level[w["win_level"]] += 1

    return {
        "total": total,
        "total_stars": total_stars,
        "by_day": by_day,
        "by_level": by_level,
    }

from datetime import datetime, date as Date, timedelta
from typing import Literal
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.records import (
    load_wins, append_win, delete_win, save_wins,
    load_winnables, save_winnables,
)
from routers.ai import supervisor_react

router = APIRouter(prefix="/wins", tags=["wins"])

WinLevel = Literal["small", "medium", "big", "future"]
STARS = {"small": 1, "medium": 2, "big": 3, "future": 0}


def _game_today() -> str:
    """游戏日以零点为起点，与自然日对齐。"""
    return str(datetime.now().date())


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

    # 搭子：记录赢麻了后必然反馈。
    # 注意：这条操作信息只作为 context 传给搭子当背景（进 AI 的 prompt），
    # 不写进对话历史、不在聊天框显示成用户气泡——聊天框里只出现搭子的反馈。
    today = win["created_at"][:10]
    recent_today = sum(1 for w in load_wins() if w["created_at"][:10] == today)
    supervisor_react("win_created", {
        "content": win["content"],
        "win_level": win["win_level"],
        "recent_count_today": recent_today,
    })

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


# ── 可赢目标 ─────────────────────────────────────────────────
# 挂在页面上的「未来可赢」，点「赢一次」累计天数/次数 + 复制进当日赢记录，
# 点「赢太多了」归档进历史。

# 可赢目标的星级：挂目标时选定，之后「赢一次」按此等级写当日记录（不含 future）
WinnableLevel = Literal["small", "medium", "big"]


class WinnableCreate(BaseModel):
    content: str
    win_level: WinnableLevel = "small"


class Winnable(BaseModel):
    id: str
    content: str
    win_level: WinnableLevel  # 赢一次时写进当日记录的等级
    created_date: str
    total_wins: int           # 累计赢的次数
    streak: int               # 连续赢的天数（今天点过即计入）
    best_streak: int          # 历史最长连续天数
    last_win_date: str | None # 最近一次赢的日期
    won_today: bool           # 今天是否已经点过


class ArchivedWinnable(BaseModel):
    id: str
    content: str
    win_level: WinnableLevel
    created_date: str
    archived_date: str
    total_wins: int
    best_streak: int


def _recalc_streak(win_days: list[str]) -> tuple[int, int]:
    """从赢的日期集合重算（当前连续天数, 历史最长连续天数）。

    当前连续：从今天（或最近一次赢的日期）往前数连续的日期。
    只有最近一次赢是今天或昨天才算「仍在连续中」。
    """
    if not win_days:
        return 0, 0
    days = sorted(set(win_days))
    # 历史最长连续
    best = 1
    cur = 1
    for i in range(1, len(days)):
        prev = Date.fromisoformat(days[i - 1])
        this = Date.fromisoformat(days[i])
        if (this - prev).days == 1:
            cur += 1
        else:
            cur = 1
        best = max(best, cur)

    # 当前连续：从最后一天往前数
    today = Date.fromisoformat(_game_today())
    last = Date.fromisoformat(days[-1])
    if (today - last).days > 1:
        return 0, best  # 已断（昨天之前就没赢了）
    streak = 1
    for i in range(len(days) - 1, 0, -1):
        this = Date.fromisoformat(days[i])
        prev = Date.fromisoformat(days[i - 1])
        if (this - prev).days == 1:
            streak += 1
        else:
            break
    return streak, best


def _to_winnable(w: dict) -> dict:
    win_days = w.get("win_days", [])
    streak, best = _recalc_streak(win_days)
    today = _game_today()
    return {
        "id": w["id"],
        "content": w["content"],
        "win_level": w.get("win_level", "small"),
        "created_date": w.get("created_date", today),
        "total_wins": w.get("total_wins", len(win_days)),
        "streak": streak,
        "best_streak": max(best, w.get("best_streak", 0)),
        "last_win_date": win_days[-1] if win_days else None,
        "won_today": today in win_days,
    }


@router.get("/winnables", response_model=list[Winnable])
def list_winnables():
    items = [w for w in load_winnables() if not w.get("archived")]
    return [_to_winnable(w) for w in items]


@router.post("/winnables", response_model=Winnable, status_code=201)
def create_winnable(body: WinnableCreate):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    items = load_winnables()
    item = {
        "id": str(uuid.uuid4()),
        "content": content,
        "win_level": body.win_level,
        "created_date": _game_today(),
        "total_wins": 0,
        "win_days": [],
        "best_streak": 0,
        "archived": False,
    }
    items.append(item)
    save_winnables(items)
    return _to_winnable(item)


@router.post("/winnables/{wid}/win", response_model=Winnable)
def win_winnable(wid: str):
    """赢一次：累计 +1，今天计入连续，并复制内容进当日赢记录（按目标星级）。"""
    items = load_winnables()
    target = next((w for w in items if w["id"] == wid and not w.get("archived")), None)
    if target is None:
        raise HTTPException(status_code=404, detail="可赢目标不存在")

    today = _game_today()
    target["total_wins"] = target.get("total_wins", 0) + 1
    win_days = target.setdefault("win_days", [])
    if today not in win_days:
        win_days.append(today)
    _, best = _recalc_streak(win_days)
    target["best_streak"] = max(best, target.get("best_streak", 0))
    save_winnables(items)

    # 复制进当日赢记录，按可赢目标设定的星级
    level = target.get("win_level", "small")
    win = {
        "id": str(uuid.uuid4()),
        "content": target["content"],
        "win_level": level,
        "stars": STARS[level],
        "created_at": datetime.now().isoformat(),
    }
    append_win(win)

    return _to_winnable(target)


@router.post("/winnables/{wid}/archive", response_model=ArchivedWinnable)
def archive_winnable(wid: str):
    """赢太多了：归档进历史，不再显示在页面上。"""
    items = load_winnables()
    target = next((w for w in items if w["id"] == wid and not w.get("archived")), None)
    if target is None:
        raise HTTPException(status_code=404, detail="可赢目标不存在")
    target["archived"] = True
    target["archived_date"] = _game_today()
    save_winnables(items)
    _, best = _recalc_streak(target.get("win_days", []))
    return {
        "id": target["id"],
        "content": target["content"],
        "win_level": target.get("win_level", "small"),
        "created_date": target.get("created_date", _game_today()),
        "archived_date": target["archived_date"],
        "total_wins": target.get("total_wins", 0),
        "best_streak": max(best, target.get("best_streak", 0)),
    }


@router.get("/winnables/archived", response_model=list[ArchivedWinnable])
def list_archived_winnables():
    items = [w for w in load_winnables() if w.get("archived")]
    out = []
    for w in items:
        _, best = _recalc_streak(w.get("win_days", []))
        out.append({
            "id": w["id"],
            "content": w["content"],
            "win_level": w.get("win_level", "small"),
            "created_date": w.get("created_date", ""),
            "archived_date": w.get("archived_date", ""),
            "total_wins": w.get("total_wins", 0),
            "best_streak": max(best, w.get("best_streak", 0)),
        })
    return out


@router.delete("/winnables/{wid}", status_code=204)
def delete_winnable(wid: str):
    items = load_winnables()
    filtered = [w for w in items if w["id"] != wid]
    if len(filtered) == len(items):
        raise HTTPException(status_code=404, detail="可赢目标不存在")
    save_winnables(filtered)

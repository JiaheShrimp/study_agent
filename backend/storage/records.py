import json
import os
from typing import Any

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "wins.json")
# 可赢目标：挂在赢麻了页面的「未来可赢」，点一下赢一次，复制进当日赢记录
WINNABLES_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "winnables.json")


def _ensure_file() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(DATA_FILE)), exist_ok=True)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)


def load_wins() -> list[dict[str, Any]]:
    _ensure_file()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_wins(wins: list[dict[str, Any]]) -> None:
    _ensure_file()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(wins, f, ensure_ascii=False, indent=2)


def append_win(win: dict[str, Any]) -> None:
    wins = load_wins()
    wins.append(win)
    save_wins(wins)


def delete_win(win_id: str) -> bool:
    wins = load_wins()
    filtered = [w for w in wins if w.get("id") != win_id]
    if len(filtered) == len(wins):
        return False
    save_wins(filtered)
    return True


# ── 可赢目标 ─────────────────────────────────────────────────
# 一条「可赢目标」挂在赢麻了页面，点「赢一次」累计赢的次数 + 连续天数，
# 同时复制内容进当日赢记录；「赢太多了」归档进历史。

def _ensure_winnables_file() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(WINNABLES_FILE)), exist_ok=True)
    if not os.path.exists(WINNABLES_FILE):
        with open(WINNABLES_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)


def load_winnables() -> list[dict[str, Any]]:
    _ensure_winnables_file()
    with open(WINNABLES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_winnables(items: list[dict[str, Any]]) -> None:
    _ensure_winnables_file()
    with open(WINNABLES_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

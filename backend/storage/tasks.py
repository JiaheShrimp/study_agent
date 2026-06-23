import json
import os
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

TEMPLATES_FILE    = os.path.join(DATA_DIR, "task_templates.json")
DAILY_TASKS_FILE  = os.path.join(DATA_DIR, "daily_tasks.json")
BOUNTY_POOL_FILE  = os.path.join(DATA_DIR, "bounty_pool.json")
DAILY_BOUNTY_FILE = os.path.join(DATA_DIR, "daily_bounties.json")
ROUTINES_FILE     = os.path.join(DATA_DIR, "routines.json")
DAILY_EXCLUDE_FILE = os.path.join(DATA_DIR, "daily_exclude.json")  # 被排除在目标计算外的日期集合
TASK_RUNS_FILE    = os.path.join(DATA_DIR, "task_runs.json")


def _read(path: str, default: Any) -> Any:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(path):
        _write(path, default)
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write(path: str, data: Any) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── 任务模板 ─────────────────────────────────────────────────

def load_templates() -> list[dict]:
    return _read(TEMPLATES_FILE, [])

def save_templates(data: list[dict]) -> None:
    _write(TEMPLATES_FILE, data)


# ── 当日任务 ─────────────────────────────────────────────────

def load_daily_tasks(date: str) -> list[dict]:
    all_days: dict = _read(DAILY_TASKS_FILE, {})
    return all_days.get(date, [])

def save_daily_tasks(date: str, tasks: list[dict]) -> None:
    all_days: dict = _read(DAILY_TASKS_FILE, {})
    all_days[date] = tasks
    _write(DAILY_TASKS_FILE, all_days)


# ── 赏金任务库 ───────────────────────────────────────────────

def load_task_runs() -> list[dict]:
    """所有任务执行记录（只读，供监管者上下文等只读消费方使用）。"""
    return _read(TASK_RUNS_FILE, [])


def load_bounty_pool() -> list[dict]:
    return _read(BOUNTY_POOL_FILE, [])

def save_bounty_pool(data: list[dict]) -> None:
    _write(BOUNTY_POOL_FILE, data)


# ── 每日赏金分配 ─────────────────────────────────────────────

def load_daily_bounties(date: str) -> dict:
    all_days: dict = _read(DAILY_BOUNTY_FILE, {})
    return all_days.get(date, {"generated": False, "bounties": []})

def save_daily_bounties(date: str, data: dict) -> None:
    all_days: dict = _read(DAILY_BOUNTY_FILE, {})
    all_days[date] = data
    _write(DAILY_BOUNTY_FILE, all_days)


# ── 常规任务 ─────────────────────────────────────────────────
# 数据结构：
# {
#   "max_routines": 3,           # 用户设定的上限
#   "fail_days_limit": 3,        # 连续失败几天触发强制警告
#   "routines": [
#     {
#       "id": "...",
#       "content": "...",
#       "hours": 1.0,
#       "stars": 3,
#       "target_days": 30,       # 目标坚持天数
#       "created_date": "YYYY-MM-DD",
#       "streak": 5,             # 当前连续完成天数
#       "best_streak": 10,       # 历史最长连续
#       "total_done": 12,        # 累计完成天数
#       "last_done_date": "YYYY-MM-DD" | null,
#       "force_warning": false,  # 是否触发强制删除警告
#       "completed": false,      # 是否达到目标天数（完成成就）
#       "log": {"YYYY-MM-DD": true/false},  # 每天完成记录（true=打卡，false=确认中断）
#       "excused": {"YYYY-MM-DD": "理由"}   # 请假日：桥接 streak，不计入连续失败
#     }
#   ]
# }

def load_routines() -> dict:
    default = {"max_routines": 3, "fail_days_limit": 3, "routines": [], "archived_routines": []}
    data = _read(ROUTINES_FILE, default)
    data.setdefault("max_routines", 3)
    data.setdefault("fail_days_limit", 3)
    data.setdefault("routines", [])
    data.setdefault("archived_routines", [])
    return data

def save_routines(data: dict) -> None:
    _write(ROUTINES_FILE, data)


# ── 每日排除标记 ─────────────────────────────────────────────
# 格式：{"YYYY-MM-DD": "理由（可为空字符串）"}

def load_excluded_dates() -> dict[str, str]:
    raw = _read(DAILY_EXCLUDE_FILE, {})
    # 兼容旧格式（list）
    if isinstance(raw, list):
        return {d: "" for d in raw}
    return raw

def save_excluded_dates(data: dict[str, str]) -> None:
    _write(DAILY_EXCLUDE_FILE, data)

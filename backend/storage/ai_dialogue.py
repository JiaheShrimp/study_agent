"""
搭子对话历史读写。

整个 agent 只有一个聊天栏，所有来往都记在这一条对话流里：
  - 用户在聊天框打的字（role=user）
  - 搭子的回复（role=assistant）
  - 由业务操作触发的搭子主动反馈（role=assistant，带 trigger）

对话历史跨天保留，是搭子「记忆」的载体：下次生成时把最近若干条拼进 prompt，
让搭子记得你俩聊过什么、避免重复（它能看到自己说过的话）。

数据文件不上传 git（在 backend/data 下）。
"""

import json
import os
import random
import uuid
from datetime import datetime
from typing import Any, Literal

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "ai_dialogue.json")

# 历史上限，超出丢弃最旧的，防止文件无限增长
MAX_TURNS = 500

Role = Literal["user", "assistant"]


def _game_today() -> str:
    """游戏日以零点为起点，与自然日对齐（与其余模块一致）。"""
    return str(datetime.now().date())


def _ensure_file() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(DATA_FILE)), exist_ok=True)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)


def load_dialogue() -> list[dict[str, Any]]:
    _ensure_file()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_dialogue(items: list[dict[str, Any]]) -> None:
    _ensure_file()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def append_turn(role: Role, content: str, trigger: str = "") -> dict[str, Any]:
    """
    追加一条对话。
    - role: user / assistant
    - trigger: 仅 assistant 的主动反馈用，标记由什么操作引发（如 win_created）
    """
    turn = {
        "id": str(uuid.uuid4()),
        "role": role,
        "content": content,
        "trigger": trigger,
        "at": datetime.now().isoformat(),
    }
    items = load_dialogue()
    items.append(turn)
    if len(items) > MAX_TURNS:
        items = items[-MAX_TURNS:]
    save_dialogue(items)
    return turn


def seconds_since_last_assistant() -> float | None:
    """距搭子上一次发言过去了多少秒（无任何发言返回 None）。

    用于触发冷却：太久没人冒泡才允许主动说话 / 操作反馈之间留间隔，避免太吵。
    """
    items = load_dialogue()
    for t in reversed(items):
        if t.get("role") == "assistant":
            try:
                last = datetime.fromisoformat(t["at"])
            except Exception:
                return None
            return (datetime.now() - last).total_seconds()
    return None


def seconds_since_last_turn() -> float | None:
    """距最近一条对话（含用户/搭子）过去多少秒。用于「闲置多久」判断。"""
    items = load_dialogue()
    if not items:
        return None
    try:
        last = datetime.fromisoformat(items[-1]["at"])
    except Exception:
        return None
    return (datetime.now() - last).total_seconds()


def _turn_day(turn: dict[str, Any]) -> str:
    """取某条对话所属的游戏日（YYYY-MM-DD）。"""
    return str(turn.get("at", ""))[:10]


def today_turns() -> list[dict[str, Any]]:
    """今天（游戏日）的对话，时间升序。

    聊天栏只呈现今天的内容——按天清零；过去的记录仍保留在文件里，只是不展示。
    """
    today = _game_today()
    return [t for t in load_dialogue() if _turn_day(t) == today]


def memory_turns(today_limit: int = 16, past_sample: int = 6) -> list[dict[str, Any]]:
    """拼进 prompt 当「记忆」的对话，时间升序。

    = 今天最近若干条（保证连续感、避免今天内重复）
      + 从更早的历史里随机抽样若干条（当学习语料，让回复更人性化；
        是否提及过去的事交给随机，不强求）。
    抽样的旧对话按时间插在今天对话之前，整体仍时间升序。
    """
    items = load_dialogue()
    today = _game_today()
    today_part = [t for t in items if _turn_day(t) == today][-today_limit:]
    past = [t for t in items if _turn_day(t) != today]
    if past_sample > 0 and len(past) > past_sample:
        sampled = random.sample(past, past_sample)
        sampled.sort(key=lambda t: t.get("at", ""))
    else:
        sampled = past
    return sampled + today_part


def recent_turns(limit: int = 16) -> list[dict[str, Any]]:
    """最近 N 条对话，时间升序（兼容旧调用；新逻辑请用 memory_turns）。"""
    return load_dialogue()[-limit:]

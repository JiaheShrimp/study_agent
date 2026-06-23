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
import uuid
from datetime import datetime
from typing import Any, Literal

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "ai_dialogue.json")

# 历史上限，超出丢弃最旧的，防止文件无限增长
MAX_TURNS = 500

Role = Literal["user", "assistant"]


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


def recent_turns(limit: int = 16) -> list[dict[str, Any]]:
    """最近 N 条对话，时间升序（用于拼进 prompt 当记忆）。"""
    return load_dialogue()[-limit:]

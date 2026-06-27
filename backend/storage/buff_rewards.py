import os
import uuid
from datetime import datetime
from typing import Literal

from storage.tasks import DATA_DIR, _read, _write

BUFF_REWARDS_FILE = os.path.join(DATA_DIR, "buff_rewards.json")


def load_buff_rewards() -> list[dict]:
    return _read(BUFF_REWARDS_FILE, [])


def save_buff_rewards(data: list[dict]) -> None:
    _write(BUFF_REWARDS_FILE, data)


def create_buff_reward(
    *,
    date: str,
    task_id: str,
    task_content: str,
    task_type: Literal["daily", "kept", "routine", "bounty"],
    buff: dict,
) -> dict:
    items = load_buff_rewards()
    buff_id = buff.get("id")
    for item in items:
        if (
            item.get("date") == date
            and item.get("task_id") == task_id
            and item.get("task_type") == task_type
            and (item.get("buff") or {}).get("id") == buff_id
        ):
            return item

    reward = {
        "id": str(uuid.uuid4()),
        "date": date,
        "task_id": task_id,
        "task_content": task_content,
        "task_type": task_type,
        "buff": buff,
        "revealed": False,
        "created_at": datetime.now().isoformat(),
        "revealed_at": "",
    }
    items.append(reward)
    save_buff_rewards(items)
    return reward


def pending_buff_rewards(date: str) -> list[dict]:
    return [
        r for r in load_buff_rewards()
        if r.get("date") == date and not r.get("revealed")
    ]


def mark_buff_reward_revealed(reward_id: str) -> dict | None:
    items = load_buff_rewards()
    for r in items:
        if r.get("id") == reward_id:
            r["revealed"] = True
            r["revealed_at"] = datetime.now().isoformat()
            save_buff_rewards(items)
            return r
    return None

from __future__ import annotations

from datetime import date as Date, timedelta, datetime
from typing import Any, Callable

from storage.buff_rewards import load_buff_rewards, save_buff_rewards
from storage.tasks import DATA_DIR, _read, _write
import os

TASK_RUNS_FILE = os.path.join(DATA_DIR, "task_runs.json")


def _effect_entry(reward: dict, multiplier: float, before: int, after: int) -> dict:
    buff = reward.get("buff", {})
    return {
        "reward_id": reward.get("id", ""),
        "buff_id": buff.get("id", ""),
        "buff_name": buff.get("name", ""),
        "multiplier": multiplier,
        "score_before": before,
        "score_after": after,
        "applied_at": datetime.now().isoformat(),
    }


def _trigger_matches(buff: dict, run: dict) -> bool:
    trigger = buff.get("trigger", "always")
    if trigger == "always":
        return True
    if trigger == "no_pause":
        return (run.get("pause_count", 0) or 0) == 0
    if trigger == "early_finish":
        return run.get("end_reason") == "early"
    return False


def _apply_score_reward_to_run(run: dict, reward: dict) -> bool:
    buff = reward.get("buff", {})
    buff_type = buff.get("type")
    if buff_type not in ("task_score", "daily_score"):
        return False
    if not run.get("success"):
        return False
    if not _trigger_matches(buff, run):
        return False

    effects = run.setdefault("buff_effects", [])
    reward_id = reward.get("id")
    if any(e.get("reward_id") == reward_id for e in effects):
        return False

    before = int(run.get("score", 0) or 0)
    if before <= 0:
        return False
    coef = float(buff.get("coef", 1.0) or 1.0)
    after = round(before * coef)
    run["score"] = after
    effects.append(_effect_entry(reward, coef, before, after))
    return after != before


def apply_score_reward(reward: dict) -> int:
    """Apply a score-affecting reward to task_runs and return how many runs changed."""
    buff = reward.get("buff", {})
    buff_type = buff.get("type")
    if buff_type not in ("task_score", "daily_score"):
        return 0

    runs: list[dict[str, Any]] = _read(TASK_RUNS_FILE, [])
    changed = 0
    for run in runs:
        if run.get("date") != reward.get("date"):
            continue
        if buff_type == "task_score" and run.get("task_id") != reward.get("task_id"):
            continue
        if _apply_score_reward_to_run(run, reward):
            changed += 1

    if changed:
        _write(TASK_RUNS_FILE, runs)
    return changed


def apply_active_daily_score_rewards(date: str) -> int:
    """Apply already-earned daily score buffs to runs saved later on the same day."""
    changed = 0
    for reward in load_buff_rewards():
        if reward.get("date") != date:
            continue
        if (reward.get("buff") or {}).get("type") != "daily_score":
            continue
        changed += apply_score_reward(reward)
    return changed


def apply_reward_effect(reward: dict) -> dict:
    buff_type = (reward.get("buff") or {}).get("type")
    handler = EFFECT_HANDLERS.get(buff_type)
    changed_runs = handler(reward) if handler else 0
    if handler:
        _mark_reward_applied(reward.get("id", ""), changed_runs)
    updated = next((r for r in load_buff_rewards() if r.get("id") == reward.get("id")), reward)
    return updated


EFFECT_HANDLERS: dict[str, Callable[[dict], int]] = {
    "task_score": apply_score_reward,
    "daily_score": apply_score_reward,
}


def _mark_reward_applied(reward_id: str, changed_runs: int) -> None:
    if not reward_id:
        return
    rewards = load_buff_rewards()
    for reward in rewards:
        if reward.get("id") == reward_id:
            reward["applied"] = True
            reward["applied_at"] = datetime.now().isoformat()
            reward["applied_runs"] = changed_runs
            break
    save_buff_rewards(rewards)


def _previous_day(day: str) -> str:
    return str(Date.fromisoformat(day) - timedelta(days=1))


def pending_lucky_dice_bonus(date: str) -> int:
    prev = _previous_day(date)
    total = 0
    for reward in load_buff_rewards():
        if reward.get("date") != prev:
            continue
        if reward.get("dice_consumed_date"):
            continue
        if (reward.get("buff") or {}).get("id") == "lucky_dice":
            total += 1
    return total


def consume_lucky_dice_bonus(date: str, rolls: list[int]) -> tuple[list[int], int]:
    bonus = pending_lucky_dice_bonus(date)
    if bonus <= 0:
        return rolls, 0

    adjusted = [min(5, max(1, int(v) + bonus)) for v in rolls]
    rewards = load_buff_rewards()
    prev = _previous_day(date)
    now = datetime.now().isoformat()
    for reward in rewards:
        if reward.get("date") != prev:
            continue
        if reward.get("dice_consumed_date"):
            continue
        if (reward.get("buff") or {}).get("id") == "lucky_dice":
            reward["applied"] = True
            reward["applied_at"] = reward.get("applied_at") or now
            reward["dice_consumed_date"] = date
    save_buff_rewards(rewards)
    return adjusted, bonus

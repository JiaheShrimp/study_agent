from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from storage.buff_effects import consume_lucky_dice_bonus
from storage.config import load_config, save_config

router = APIRouter(prefix="/bonus", tags=["bonus"])


class DailyBonus(BaseModel):
    date: str        # YYYY-MM-DD（以当天8点为起点的"日期"）
    rolls: list[int]
    multiplier: float  # 1.0-3.0
    dice_bonus: int = 0


def _current_game_date() -> str:
    """游戏日以零点为起点，与自然日对齐。"""
    return str(datetime.now().date())


def _calc_multiplier(rolls: list[int]) -> float:
    if not rolls:
        return 1.0
    avg = sum(rolls) / len(rolls)
    raw = 1 + ((avg - 1) / 4) * 2
    return round(raw * 10) / 10


@router.get("/today", response_model=DailyBonus | None)
def get_today_bonus():
    """返回当前游戏日的倍数，没有则返回 null。"""
    cfg = load_config()
    game_date = _current_game_date()
    saved = cfg.get("daily_bonus")
    if saved and saved.get("date") == game_date:
        return DailyBonus(**saved)
    return None


@router.post("/today", response_model=DailyBonus)
def save_today_bonus(body: DailyBonus):
    """保存当前游戏日的抽奖结果。"""
    cfg = load_config()
    # 强制写入当前游戏日期，防止前端传错
    data = body.model_dump()
    data["date"] = _current_game_date()
    rolls = [max(1, min(5, int(v))) for v in data.get("rolls", [])[:3]]
    rolls, dice_bonus = consume_lucky_dice_bonus(data["date"], rolls)
    data["rolls"] = rolls
    data["multiplier"] = _calc_multiplier(rolls)
    data["dice_bonus"] = dice_bonus
    cfg["daily_bonus"] = data
    save_config(cfg)
    return DailyBonus(**data)

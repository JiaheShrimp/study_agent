from datetime import date
from fastapi import APIRouter
from pydantic import BaseModel
from storage.config import load_config, save_config

router = APIRouter(prefix="/bonus", tags=["bonus"])


class DailyBonus(BaseModel):
    date: str        # YYYY-MM-DD
    rolls: list[int] # 三个数字
    multiplier: float  # 倍数（1.0-3.0）


@router.get("/today", response_model=DailyBonus | None)
def get_today_bonus():
    """返回今天已保存的倍数，没有则返回 null。"""
    cfg = load_config()
    today = str(date.today())
    saved = cfg.get("daily_bonus")
    if saved and saved.get("date") == today:
        return DailyBonus(**saved)
    return None


@router.post("/today", response_model=DailyBonus)
def save_today_bonus(body: DailyBonus):
    """保存今天的抽奖结果（只存当天，第二天自动失效）。"""
    cfg = load_config()
    cfg["daily_bonus"] = body.model_dump()
    save_config(cfg)
    return body

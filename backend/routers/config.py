from fastapi import APIRouter
from pydantic import BaseModel

from storage.config import load_config, save_config

router = APIRouter(prefix="/config", tags=["config"])


class ReminderConfig(BaseModel):
    reminder_enabled: bool
    reminder_times: list[str]  # ["HH:MM", ...]


class WorkRestConfig(BaseModel):
    work_mins: int   # 每工作段分钟数，默认 30
    rest_mins: int   # 每休息段分钟数（休息预算），默认 5


@router.get("/reminder", response_model=ReminderConfig)
def get_reminder():
    cfg = load_config()
    return ReminderConfig(
        reminder_enabled=cfg["reminder_enabled"],
        reminder_times=cfg["reminder_times"],
    )


@router.put("/reminder", response_model=ReminderConfig)
def update_reminder(body: ReminderConfig):
    cfg = load_config()
    cfg["reminder_enabled"] = body.reminder_enabled
    cfg["reminder_times"] = body.reminder_times
    save_config(cfg)
    return body


@router.get("/work-rest", response_model=WorkRestConfig)
def get_work_rest():
    cfg = load_config()
    return WorkRestConfig(
        work_mins=cfg["work_mins"],
        rest_mins=cfg["rest_mins"],
    )


@router.put("/work-rest", response_model=WorkRestConfig)
def update_work_rest(body: WorkRestConfig):
    cfg = load_config()
    cfg["work_mins"] = max(5, min(120, body.work_mins))
    cfg["rest_mins"] = max(1, min(30, body.rest_mins))
    save_config(cfg)
    return WorkRestConfig(work_mins=cfg["work_mins"], rest_mins=cfg["rest_mins"])


class EffectiveTimeMode(BaseModel):
    mode: str  # "actual" | "planned"


@router.get("/effective-time-mode", response_model=EffectiveTimeMode)
def get_effective_time_mode():
    cfg = load_config()
    return EffectiveTimeMode(mode=cfg.get("effective_time_mode", "actual"))


@router.put("/effective-time-mode", response_model=EffectiveTimeMode)
def update_effective_time_mode(body: EffectiveTimeMode):
    if body.mode not in ("actual", "planned"):
        from fastapi import HTTPException
        raise HTTPException(400, "mode 必须是 actual 或 planned")
    cfg = load_config()
    cfg["effective_time_mode"] = body.mode
    save_config(cfg)
    return body



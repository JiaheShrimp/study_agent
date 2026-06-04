from fastapi import APIRouter
from pydantic import BaseModel

from storage.config import load_config, save_config

router = APIRouter(prefix="/config", tags=["config"])


class ReminderConfig(BaseModel):
    reminder_enabled: bool
    reminder_times: list[str]  # ["HH:MM", ...]


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

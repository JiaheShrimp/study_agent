import json
import os
from typing import Any

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "config.json")

DEFAULTS: dict[str, Any] = {
    "reminder_enabled": False,
    "reminder_times": ["21:00"],
    "work_mins": 30,
    "rest_mins": 5,
    "effective_time_mode": "actual",  # actual | planned
    "ai_provider": "",          # anthropic | openai | deepseek | openai_compat
    "ai_api_key": "",
    "ai_model": "",             # 用户自填模型名，空则用 hint_model
    "ai_custom_base_url": "",   # 仅 openai_compat 模式需要填写
}


def _ensure_file() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(CONFIG_FILE)), exist_ok=True)
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULTS, f, ensure_ascii=False, indent=2)


def load_config() -> dict[str, Any]:
    _ensure_file()
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    # 补上缺失的默认值
    for k, v in DEFAULTS.items():
        data.setdefault(k, v)
    return data


def save_config(config: dict[str, Any]) -> None:
    _ensure_file()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

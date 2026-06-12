"""
AI 配置与状态接口。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.config import load_config, save_config
import ai_client

router = APIRouter(prefix="/ai", tags=["ai"])


class ProviderMeta(BaseModel):
    id: str
    label: str
    hint_model: str
    hint_key: str
    needs_base_url: bool


class AIStatus(BaseModel):
    available: bool
    provider: str
    key_set: bool
    model: str
    custom_base_url: str
    providers: list[ProviderMeta]


class AIConfigUpdate(BaseModel):
    provider: str
    api_key: str
    model: str = ""
    custom_base_url: str = ""


@router.get("/status", response_model=AIStatus)
def get_ai_status():
    cfg = load_config()
    providers = [
        ProviderMeta(
            id=pid,
            label=info["label"],
            hint_model=info["hint_model"],
            hint_key=info["hint_key"],
            needs_base_url=(pid == "openai_compat"),
        )
        for pid, info in ai_client.PROVIDERS.items()
    ]
    return AIStatus(
        available=ai_client.is_available(),
        provider=cfg.get("ai_provider", ""),
        key_set=bool(cfg.get("ai_api_key", "").strip()),
        model=cfg.get("ai_model", ""),
        custom_base_url=cfg.get("ai_custom_base_url", ""),
        providers=providers,
    )


@router.put("/config")
def update_ai_config(body: AIConfigUpdate):
    if body.provider and body.provider not in ai_client.PROVIDERS:
        raise HTTPException(400, f"不支持的 provider：{body.provider}")
    cfg = load_config()
    cfg["ai_provider"] = body.provider.strip()
    cfg["ai_api_key"] = body.api_key.strip()
    cfg["ai_model"] = body.model.strip()
    cfg["ai_custom_base_url"] = body.custom_base_url.strip()
    save_config(cfg)
    return {"ok": True, "available": ai_client.is_available()}

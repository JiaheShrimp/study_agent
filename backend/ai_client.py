"""
AI 客户端封装，零第三方依赖，直接用 urllib 发 HTTP 请求。
Anthropic 和所有 OpenAI 兼容接口均原生支持，无需 pip install 任何 SDK。
"""

from __future__ import annotations
import json
import re
import urllib.request
import urllib.error
from typing import Any

from storage.config import load_config

# provider 元数据
# protocol: "anthropic" 用 Anthropic Messages API；"openai" 用 OpenAI Chat Completions API
# base_url: None 表示用官方端点；openai_compat 由用户自填
PROVIDERS: dict[str, dict] = {
    "anthropic": {
        "label": "Claude (Anthropic)",
        "hint_model": "claude-haiku-4-5-20251001",
        "hint_key": "sk-ant-…",
        "protocol": "anthropic",
        "base_url": "https://api.anthropic.com",
    },
    "openai": {
        "label": "OpenAI",
        "hint_model": "gpt-4o-mini",
        "hint_key": "sk-…",
        "protocol": "openai",
        "base_url": "https://api.openai.com/v1",
    },
    "deepseek": {
        "label": "DeepSeek",
        "hint_model": "deepseek-chat",
        "hint_key": "sk-…",
        "protocol": "openai",
        "base_url": "https://api.deepseek.com/v1",
    },
    "qwen": {
        "label": "通义千问 (阿里云)",
        "hint_model": "qwen-turbo",
        "hint_key": "sk-…",
        "protocol": "openai",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    "doubao": {
        "label": "豆包 (字节跳动)",
        "hint_model": "doubao-pro-4k",
        "hint_key": "…",
        "protocol": "openai",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
    },
    "zhipu": {
        "label": "智谱 GLM",
        "hint_model": "glm-4-flash",
        "hint_key": "…",
        "protocol": "openai",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
    },
    "moonshot": {
        "label": "Moonshot (Kimi)",
        "hint_model": "moonshot-v1-8k",
        "hint_key": "sk-…",
        "protocol": "openai",
        "base_url": "https://api.moonshot.cn/v1",
    },
    "minimax": {
        "label": "MiniMax",
        "hint_model": "abab6.5s-chat",
        "hint_key": "…",
        "protocol": "openai",
        "base_url": "https://api.minimax.chat/v1",
    },
    "groq": {
        "label": "Groq",
        "hint_model": "llama-3.1-8b-instant",
        "hint_key": "gsk_…",
        "protocol": "openai",
        "base_url": "https://api.groq.com/openai/v1",
    },
    "gemini": {
        "label": "Google Gemini",
        "hint_model": "gemini-1.5-flash",
        "hint_key": "AIza…",
        "protocol": "openai",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    "openai_compat": {
        "label": "OpenAI 兼容（自定义）",
        "hint_model": "模型名称",
        "hint_key": "API Key",
        "protocol": "openai",
        "base_url": None,  # 由用户填写 custom_base_url
    },
}


def _cfg() -> dict:
    cfg = load_config()
    return {
        "provider": cfg.get("ai_provider", ""),
        "key": cfg.get("ai_api_key", "").strip(),
        "model": cfg.get("ai_model", "").strip(),
        "custom_base_url": cfg.get("ai_custom_base_url", "").strip(),
    }


def is_available() -> bool:
    """key 和 provider 都填了就可用，无需任何额外依赖。"""
    c = _cfg()
    if not c["provider"] or not c["key"]:
        return False
    info = PROVIDERS.get(c["provider"])
    if not info:
        return False
    if c["provider"] == "openai_compat" and not c["custom_base_url"]:
        return False
    return True


def _http_post(url: str, headers: dict, body: dict, timeout: int = 30) -> dict:
    """用标准库发 POST 请求，返回解析后的 JSON。"""
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err_body}") from e


def _call_anthropic(key: str, base_url: str, model: str, system: str, messages: list[dict], max_tokens: int) -> str:
    url = f"{base_url.rstrip('/')}/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
    }
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        body["system"] = system
    resp = _http_post(url, headers, body)
    return resp["content"][0]["text"]


def _call_openai_compat(key: str, base_url: str, model: str, system: str, messages: list[dict], max_tokens: int) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.extend(messages)
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": msgs,
    }
    resp = _http_post(url, headers, body)
    return resp["choices"][0]["message"]["content"]


def chat_messages(messages: list[dict], system: str = "", max_tokens: int = 1024) -> str | None:
    """
    用当前配置的 provider 发一段多轮对话，返回文本。
    messages: [{"role": "user"|"assistant", "content": "..."}]，时间升序。
    不可用或出错时返回 None（调用方降级）。
    """
    if not is_available() or not messages:
        return None
    c = _cfg()
    info = PROVIDERS[c["provider"]]
    model = c["model"] or info["hint_model"]
    base_url = c["custom_base_url"] if c["provider"] == "openai_compat" else info["base_url"]
    try:
        if info["protocol"] == "anthropic":
            return _call_anthropic(c["key"], base_url, model, system, messages, max_tokens)
        else:
            return _call_openai_compat(c["key"], base_url, model, system, messages, max_tokens)
    except Exception:
        return None


def chat(prompt: str, system: str = "", max_tokens: int = 1024) -> str | None:
    """
    单轮：发一条 user 消息，返回文本。是 chat_messages 的便捷包装。
    不可用或出错时返回 None（调用方降级）。
    """
    return chat_messages([{"role": "user", "content": prompt}], system=system, max_tokens=max_tokens)


def chat_json(prompt: str, system: str = "", max_tokens: int = 1024) -> Any | None:
    """发消息并解析 JSON 回复，失败返回 None。"""
    text = chat(prompt, system=system, max_tokens=max_tokens)
    if text is None:
        return None
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = m.group(1).strip() if m else text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        candidates = [raw.find(c) for c in "[{" if raw.find(c) != -1]
        start = min(candidates) if candidates else -1
        if start == -1:
            return None
        try:
            return json.loads(raw[start:])
        except json.JSONDecodeError:
            return None

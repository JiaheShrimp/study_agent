"""
AI 工具注册表 —— 「搭子接管 agent 操控权」的统一地基。

本质：把「AI 能对 agent 做的每一件事」抽象成一个 Tool，集中注册在这里。
聊天时，搭子（AI）根据用户意图自己选工具、填参数；后端统一校验、统一执行。

加一个新指令（如送 buff、调目标）= 写一个 handler 函数 + `@register_tool(...)`，
**不用碰任何识别/分发逻辑**——prompt 里的工具说明、function calling 的 tools
参数、执行分发，全部自动带上这个新工具。

每个 Tool：
  - name:        工具名（AI 用它指定要调哪个）
  - description: 给 AI 看的能力说明（什么时候该用）
  - parameters:  JSON Schema（OpenAI / Anthropic function calling 通用格式）
  - handler:     (args: dict) -> ToolResult，真正操控 agent 的函数

handler 自己负责参数校验与落地；返回 ToolResult 告诉调用方成功与否、
以及一句给用户的话（reply）和可选的副作用标记（meta，供前端联动）。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ToolResult:
    """工具执行结果。"""
    ok: bool
    reply: str = ""                       # 执行后跟用户说的一句话（搭子口吻）
    meta: dict[str, Any] = field(default_factory=dict)  # 副作用标记，供前端联动（如 {"assigned_bounty": True}）


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]            # JSON Schema
    handler: Callable[[dict], ToolResult]
    intent_keywords: list[str] = field(default_factory=list)  # 命中则强制调本工具


# 全局注册表：name -> Tool
TOOL_REGISTRY: dict[str, Tool] = {}


def register_tool(name: str, description: str, parameters: dict[str, Any],
                  intent_keywords: list[str] | None = None):
    """装饰器：把一个 handler 注册成工具。

    intent_keywords: 用户消息里命中任一关键词时，强制让模型调用本工具
    （绕开推理模型在强人设下滑回闲聊的问题）。可留空，靠模型自己判断。

    用法：
        @register_tool("assign_task", "给用户派一个任务", {...schema...},
                       intent_keywords=["派任务", "给我个任务"])
        def _assign_task(args: dict) -> ToolResult: ...
    """
    def deco(fn: Callable[[dict], ToolResult]) -> Callable[[dict], ToolResult]:
        TOOL_REGISTRY[name] = Tool(name=name, description=description,
                                   parameters=parameters, handler=fn,
                                   intent_keywords=intent_keywords or [])
        return fn
    return deco


def match_forced_tool(user_msg: str) -> str | None:
    """根据用户消息里的意图关键词，返回应强制调用的工具名（无则 None）。"""
    msg = (user_msg or "").lower()
    for tool in TOOL_REGISTRY.values():
        for kw in tool.intent_keywords:
            if kw.lower() in msg:
                return tool.name
    return None


def json_extract_prompt(name: str) -> str | None:
    """为指定工具生成一段「让模型按 schema 返回 JSON 填参数」的指令。

    用于推理模型（thinking mode）不稳定支持原生 function calling 时的兜底路径：
    意图已确定要调本工具，只需模型把参数填好。返回 None 表示无此工具。
    """
    tool = TOOL_REGISTRY.get(name)
    if tool is None:
        return None
    props = tool.parameters.get("properties", {})
    required = tool.parameters.get("required", [])
    field_lines = []
    for k, spec in props.items():
        req = "必填" if k in required else "可选"
        field_lines.append(f"  - {k}（{spec.get('type', 'string')}，{req}）：{spec.get('description', '')}")
    fields = "\n".join(field_lines)
    return (
        f"用户想让你执行：{tool.description}\n"
        f"请只返回一个 JSON 对象，按以下字段把参数填具体、填合理：\n{fields}\n"
        "结合你对他的了解填，别套路化。只输出 JSON，不要任何多余文字。"
    )


def openai_tools_spec() -> list[dict]:
    """把注册表导出成 OpenAI function-calling 的 tools 参数格式。"""
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            },
        }
        for t in TOOL_REGISTRY.values()
    ]


def execute_tool(name: str, args: dict) -> ToolResult:
    """统一执行入口：查表 → 调 handler。未知工具/异常都安全兜底。"""
    tool = TOOL_REGISTRY.get(name)
    if tool is None:
        return ToolResult(ok=False, reply="")
    try:
        return tool.handler(args or {})
    except Exception:
        # 工具落地失败绝不能影响聊天主流程
        return ToolResult(ok=False, reply="")


# ─────────────────────────────────────────────────────────────
# 工具实现
# 在此登记 agent 能被 AI 操控的每一件事。加新指令照葫芦画瓢即可。
# ─────────────────────────────────────────────────────────────

@register_tool(
    name="assign_task",
    description=(
        "当用户想要/请求你给他派一个任务、安排点事做、来个学习任务时调用。"
        "会落地成一个带奖励 buff 的赏金任务，立即出现在他的任务页。"
        "结合你对他的了解派对他有意义的事，别套路化。"
    ),
    parameters={
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "任务内容，具体可执行，如「读 30 分钟英文文献」"},
            "hours": {"type": "number", "description": "预计时长（小时），0.25~4 之间合理即可"},
            "stars": {"type": "integer", "description": "重要程度，1~5 的整数"},
            "reason": {"type": "string", "description": "派这个任务的理由，朋友口吻，≤30字，不喊口号"},
        },
        "required": ["content"],
    },
    intent_keywords=["派任务", "派个任务", "派一个任务", "给我任务", "给我个任务",
                     "给我一个任务", "来个任务", "来个学习任务", "安排任务",
                     "安排点事", "安排个任务", "布置任务", "整个任务"],
)
def _assign_task(args: dict) -> ToolResult:
    """派发赏金任务（复用 routers/tasks 的赏金落地，和随机赏金完全一样）。"""
    from routers.tasks import append_bounty_task
    content = str(args.get("content", "")).strip()
    if not content:
        return ToolResult(ok=False, reply="")
    reason = str(args.get("reason", "")).strip()
    bounty = append_bounty_task(
        content=content,
        hours=args.get("hours", 1.0),
        stars=args.get("stars", 3),
        reason=reason,
    )
    # reply 优先用 AI 给的理由，否则给个朴素确认
    reply = reason or f"给你派好了：{bounty['content']}。"
    return ToolResult(ok=True, reply=reply, meta={"assigned_bounty": True})

"""
AI 配置与状态接口 + 搭子（成长伙伴）核心。

搭子是"AI 接管整个 agent"的统一入口：
  - 业务操作触发：agent 各处调用 supervisor_react()，搭子异步生成主动反馈，
    写入对话历史（前端聊天栏轮询展示）。
  - 用户主动聊天：POST /ai/chat，搭子带历史生成回复。

两条路径共用同一条「对话历史」（storage/ai_dialogue），既是聊天栏的内容，
也是搭子的「记忆」——每次生成都把最近对话（含搭子自己说过的话）拼进 prompt，
让它有连续感、且不重复。

目前只接入「赢麻了」页面（见 routers/wins.py），其余触发点后续逐步接入。
"""

import random
import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.config import load_config, save_config
from storage import ai_dialogue
import ai_client

router = APIRouter(prefix="/ai", tags=["ai"])


# ─────────────────────────────────────────────────────────────
# AI 自主监管者（supervisor）
# ─────────────────────────────────────────────────────────────

# 固定人设：一个真正了解你这个人、陪着你成长的「搭子」，不是上司、不是监工。
SUPERVISOR_SYSTEM = (
    "你是一个游戏化成长 App 里住着的小伙伴——用户的老朋友、搭子，而不是监工或老师。\n"
    "下面会给你他在 App 里记录的**全部**进步、专注时长、习惯打卡。"
    "请把这些当成你对这个人的全部了解：你知道他这段时间都在忙什么、"
    "在意什么、有过哪些高光、哪些事一直在坚持。\n"
    "你的性格：真诚、有人味、偶尔俏皮，会真心为他的进步高兴，也会半开玩笑地损他一下"
    "——但绝不说教、不喊口号、不像班主任。\n"
    "硬性要求：\n"
    "1. 只输出一句话，最多 40 个字，像朋友发微信一样随口一说；不要解释、不要列点、不要加引号。\n"
    "2. 从他的**整体记录**里自由挑你想聊的点说具体的话——可以是某件让你印象深刻的事、"
    "某个长期坚持的习惯、某段时间的状态，甚至把几件事串起来调侃。"
    "不用拘泥于他今天做了什么；今天没什么内容就聊别的，别硬凑今天。\n"
    "3. 让他感觉你是真的认识他这个人、记得他做过的事，而不是一个只会套话的机器人。\n"
    "4. 禁止说『加油』『好好学习』『快去写作业』这类空泛、说教、命令式的话。\n"
    "5. 用中文，可以带一点 emoji 但别超过一个。"
)

# ─────────────────────────────────────────────────────────────
# 触发器注册表（统一结构）
#
# 搭子对 agent 里各种操作的反馈，全部收拢成「一个触发器 = 一条注册」：
#   - prob:     命中概率（0~1），控制冒泡频率
#   - cooldown: 全局冷却秒数——距搭子上次发言不足这么久则跳过，避免连续操作太吵
#               （win_created 例外：记赢必回，cooldown=0）
#   - scene:    场景构造器 (context)->str，只描述「这次发生了什么」；
#               业务数据/对话历史由 _history_messages 统一注入，不在这里拼
#   - fallback: AI 不可用/超时时的兜底文案池（伙伴口吻，不说教）
#
# 加新触发点：在 TRIGGERS 里加一条 Trigger，然后在业务函数里调 supervisor_react("xxx", {...})。
# 不用改任何分发/冷却逻辑。
# ─────────────────────────────────────────────────────────────

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Trigger:
    prob: float
    cooldown: int                       # 全局冷却秒数（距上次搭子发言）
    scene: Callable[[dict], str]
    fallback: list[str] = field(default_factory=list)


def _scene_win(context: dict) -> str:
    level_label = {
        "small": "小赢（做到了一件事）",
        "medium": "中赢（明显进步）",
        "big": "特大赢（重大突破）",
        "future": "未来可赢（今天没做好，但以后能做到）",
    }.get(context.get("win_level", ""), "一条进步记录")
    content = context.get("content", "")
    recent = context.get("recent_count_today", 0)
    s = [f"我刚刚在「赢麻了」里记录了一条 {level_label}，内容是：「{content}」。"]
    if recent > 1:
        s.append(f"这是我今天记录的第 {recent} 条了。")
    s.append("请像朋友一样，结合这条记录和你对我的了解，自然地回我一句。")
    return "\n".join(s)


def _scene_task_done(context: dict) -> str:
    content = context.get("content", "")
    early = context.get("early", False)
    mins = context.get("minutes", 0)
    score = context.get("score", 0)
    s = [f"我刚完成了任务「{content}」" + ("，还是提前完成的" if early else "") + "。"]
    if mins:
        s.append(f"专注了大约 {mins} 分钟" + (f"，拿了 {score} 分。" if score else "。"))
    s.append("像朋友一样，结合这件事和你对我的了解，自然回我一句（别喊口号）。")
    return "\n".join(s)


def _scene_task_failed(context: dict) -> str:
    content = context.get("content", "")
    reason = context.get("reason", "")
    pct = context.get("percent", 0)
    how = "中途停了" if reason == "giveup" else "力竭没撑住"
    s = [f"我刚才做任务「{content}」{how}，完成了大概 {pct}%。"]
    s.append("别说教、别让我加油，就像懂我的朋友那样轻松接一句（可以损我但要暖）。")
    return "\n".join(s)


def _scene_task_start(context: dict) -> str:
    content = context.get("content", "")
    return (f"我刚开始做任务「{content}」，正在计时。"
            "随口给我一句话就行，别喊口号、别命令我，像朋友一样。")


def _scene_routine_milestone(context: dict) -> str:
    content = context.get("content", "")
    streak = context.get("streak", 0)
    return (f"我的常规习惯「{content}」已经连续打卡 {streak} 天了。"
            "这是个值得一提的里程碑，像朋友一样真心替我高兴地说一句。")


def _scene_idle(context: dict) -> str:
    mins = context.get("idle_minutes", 0)
    return ("现在没什么新动静"
            + (f"（大概 {mins} 分钟没动了）" if mins else "")
            + "。你不是来催我的——就随口找点我记录里的事聊聊、调侃一下，"
            "像朋友突然发来一条微信。别提『加油/快去学习』。")


# trigger id -> Trigger。新增触发点只在这里加一条。
TRIGGERS: dict[str, Trigger] = {
    "win_created": Trigger(
        prob=1.0, cooldown=0, scene=_scene_win,
        fallback=["看到啦，这条记下了，挺好的。👀", "嘿，又赢了一把，我有在认真看哦。",
                  "记下来了，这种感觉是不是还挺爽的。", "不错呀，这一笔我替你高兴。"],
    ),
    "task_done": Trigger(
        prob=0.7, cooldown=900, scene=_scene_task_done,
        fallback=["搞定一个，舒服。", "这件事画上句号啦，不错。", "完成了哈，我看着呢。"],
    ),
    "task_failed": Trigger(
        prob=0.6, cooldown=900, scene=_scene_task_failed,
        fallback=["没关系，停一下也正常。", "今天先这样，回头再说。", "嗯，状态有起伏很正常。"],
    ),
    "task_start": Trigger(
        prob=0.25, cooldown=1800, scene=_scene_task_start,
        fallback=["开整啦，我陪着。", "走起，我在这看着。"],
    ),
    "routine_milestone": Trigger(
        prob=0.9, cooldown=600, scene=_scene_routine_milestone,
        fallback=["这个坚持得是真可以。", "连着这么多天，稳。"],
    ),
    "idle": Trigger(
        prob=1.0, cooldown=0, scene=_scene_idle,   # 主动说话：频率由后台定时器控制
        fallback=["在忙啥呢，冒个泡。", "我突然想起你前两天那条记录，挺有意思。"],
    ),
}


def _history_messages(extra_user: str) -> list[dict]:
    """
    把搭子的全部业务数据 + 你俩最近的对话历史，组装成发给 AI 的 messages。

    结构（时间升序）：
      user:      [全部业务数据快照]（每次都带，本地读零成本，含随机抽样）
      user/assistant: 最近若干轮真实对话（搭子能看到自己说过的话 → 防重复）
      user:      本次的新输入 / 场景描述（extra_user）

    业务数据放在最前面当背景，对话历史让搭子有连续记忆。
    """
    from supervisor_context import build_summary
    summary = build_summary()

    messages: list[dict] = [
        {
            "role": "user",
            "content": (
                "（这是背景资料，不用回复）下面是我在 App 里记录的全部内容，"
                "请把它当成你对我的了解：\n" + summary
            ),
        },
        {
            "role": "assistant",
            "content": "嗯，我都看着呢，记着你这些事。",
        },
    ]

    # 拼记忆对话：今天的全部 + 更早历史的随机抽样（学习语料，让回复更人性化）。
    # 含搭子自己的回复，这样它知道说过什么、避免今天内重复。
    for t in ai_dialogue.memory_turns(today_limit=16, past_sample=6):
        role = t.get("role")
        content = t.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": extra_user})
    return messages


def _generate(extra_user: str, *, fallback_pool: list[str]) -> str:
    """
    带对话历史生成一句搭子的话；AI 不可用/失败时回退到兜底文案。
    超时重试一次，降低撞兜底概率。

    注意 max_tokens：部分模型是「推理模型」（如 deepseek-v4-pro / o1 系列），
    会先用大量 token 内部思考（reasoning_content）再输出正式回复（content）。
    若上限太小，token 全被思考吃光，content 返回空、白等一场还触发重试。
    故这里给足 800，确保推理模型也能正常出回复。普通模型用不满，无额外成本。
    """
    if ai_client.is_available():
        for _ in range(2):
            messages = _history_messages(extra_user)
            line = ai_client.chat_messages(messages, system=SUPERVISOR_SYSTEM, max_tokens=800)
            if line:
                line = line.strip().strip('"“”\'')
                if line:
                    return line
    return random.choice(fallback_pool or ["……"])


def _react_sync(trigger: str, context: dict) -> None:
    """后台线程：业务操作触发的主动反馈，生成后写入对话历史。"""
    try:
        t = TRIGGERS.get(trigger)
        scene = t.scene(context) if t else "请随口跟我说一句。"
        line = _generate(scene, fallback_pool=(t.fallback if t else []))
        ai_dialogue.append_turn("assistant", line, trigger=trigger)
    except Exception:
        # 搭子出错绝不能影响主流程
        pass


def supervisor_react(trigger: str, context: dict | None = None, *, force: bool = False) -> None:
    """
    搭子统一入口。agent 任意操作都可以调用它。

    - trigger: 触发来源标识（在 TRIGGERS 注册过）
    - context: 该次操作的相关数据，交给场景构造器
    - force:   True 时跳过概率/冷却判定，必定反馈

    判定顺序：① 全局冷却（距上次搭子发言不足 cooldown 秒则跳过，避免连续操作太吵）
    → ② 命中概率。通过后在后台线程异步生成并写入对话历史，不阻塞主请求。
    前端聊天栏轮询 /ai/dialogue 即可看到新消息。
    """
    context = context or {}
    t = TRIGGERS.get(trigger)
    if t is None:
        return
    if not force:
        # 全局冷却：太久没冒泡才允许，避免短时间连环触发刷屏
        if t.cooldown > 0:
            gap = ai_dialogue.seconds_since_last_assistant()
            if gap is not None and gap < t.cooldown:
                return
        if random.random() > t.prob:
            return
    threading.Thread(target=_react_sync, args=(trigger, context), daemon=True).start()


# ── 主动说话（后台定时，随机间隔不吵） ─────────────────────────────
#
# 你不操作、开着 agent 时，搭子也会偶尔自己冒个泡。靠一个后台线程：
# 每隔一段时间醒来，按概率 + 冷却决定要不要主动说一句（结合你的数据随口聊）。
# 关键是「不吵」：醒来间隔随机、有概率不说、距上次任何对话太近就跳过。

IDLE_CHECK_MIN_SEC = 30 * 60      # 醒来检查的最小间隔
IDLE_CHECK_MAX_SEC = 90 * 60      # 最大间隔（每轮在这区间随机）
IDLE_MIN_QUIET_SEC = 25 * 60      # 距最近一条对话至少这么久没动静，才考虑主动说
IDLE_SPEAK_PROB = 0.6             # 满足安静条件后，仍按此概率决定是否真说（再降一档频率）


def _idle_speak_once() -> None:
    """满足条件就主动说一句（结合数据随口聊）。不满足则安静。"""
    quiet = ai_dialogue.seconds_since_last_turn()
    # 最近有过对话（你刚操作过/刚聊过）→ 不打扰
    if quiet is not None and quiet < IDLE_MIN_QUIET_SEC:
        return
    if random.random() > IDLE_SPEAK_PROB:
        return
    idle_min = int(quiet // 60) if quiet else 0
    supervisor_react("idle", {"idle_minutes": idle_min}, force=True)


def start_idle_speaker() -> None:
    """启动后台主动说话线程（进程内只需启一次）。AI 不可用时静默空转。"""
    def loop():
        import time
        while True:
            time.sleep(random.randint(IDLE_CHECK_MIN_SEC, IDLE_CHECK_MAX_SEC))
            try:
                if ai_client.is_available():
                    _idle_speak_once()
            except Exception:
                pass
    threading.Thread(target=loop, daemon=True).start()


# ── 对话历史接口（聊天栏） ──────────────────────────────────────

class DialogueTurn(BaseModel):
    id: str
    role: str
    content: str
    trigger: str
    at: str


@router.get("/dialogue", response_model=list[DialogueTurn])
def get_dialogue(limit: int = 50):
    """聊天栏拉取对话渲染——只返回今天（游戏日）的，按天清零。

    过去的对话仍保留在后台文件里，只是不呈现给用户；
    搭子生成回复时仍可把历史当学习语料（见 memory_turns）。
    """
    return ai_dialogue.today_turns()[-limit:]


class ChatIn(BaseModel):
    message: str


class ChatOut(BaseModel):
    reply: DialogueTurn
    assigned_bounty: bool = False   # 本次是否派发了赏金任务（前端据此刷新任务页）
    bounty_content: str = ""        # 派发的任务内容（前端在聊天里明确展示派了啥）


# ── 聊天里的「工具调用」：搭子接管 agent 操控权（统一地基） ──────────
#
# 聊天不再只是回话。每次发消息，走原生 function calling：把注册表里**所有**
# 工具的说明喂给 AI（见 ai_tools.TOOL_REGISTRY），AI 自己决定是聊天还是调工具、
# 调哪个、填什么参数。后端统一执行（ai_tools.execute_tool）。
#
# 加新指令（送 buff / 调目标 / …）= 在 ai_tools.py 写个 handler + @register_tool，
# **这里一行都不用改**——prompt 的工具说明、FC 的 tools 参数、执行分发全自动支持。
#
# 安全：工具 handler 自己严格校验落地；FC 不支持/不可用/失败 → 降级普通闲聊。

_TOOL_HINT = (
    "\n\n———\n【重要】你现在能直接操控这个 App（见提供的工具）。这条规则**高于**上面的聊天人设：\n"
    "- 只要用户明确在请求一件你有工具能做的事（例如「给我个任务」「派个任务」「安排点事做」"
    "「来个学习任务」），**必须调用对应工具去真正执行**，绝不能只用聊天敷衍他（比如回「好嘞我看看」却什么都不做）。\n"
    "- 调用工具时，自己结合对他的了解把参数填具体、填合理。\n"
    "- 只有当他纯粹在闲聊、倾诉、问问题、没有让你做事时，才正常聊天回一句话。"
)


def _plain_chat() -> str:
    """普通闲聊：带历史和业务数据生成一句话（AI 不可用时兜底）。"""
    return _generate(
        "（请像朋友一样回复我上面这条消息，结合你对我的了解，自然地接着聊。）",
        fallback_pool=["嗯嗯，我在听。", "哈哈，说说看？", "我懂你的意思。", "这个我记下了。"],
    )


def _run_tool_via_json(tool_name: str) -> tuple[str, dict] | None:
    """意图已确定要调某工具 → 让模型按其 schema 返回 JSON 填参数，解析后落地。

    用于推理模型（deepseek-v4-pro 等 thinking mode）不稳定支持原生 FC 的兜底路径：
    deepseek 能稳定按指令返回 JSON。返回 (reply, meta)，失败返回 None（交回上层降级）。
    """
    import ai_tools
    extract = ai_tools.json_extract_prompt(tool_name)
    if not extract:
        return None
    messages = _history_messages(extract)
    raw = ai_client.chat_messages(messages, system=SUPERVISOR_SYSTEM, max_tokens=800)
    if not raw:
        return None
    # 容错解析：```json``` / 裸 JSON / 第一个{到最后一个}
    import json as _json, re as _re
    text = raw.strip()
    m = _re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    cand = m.group(1).strip() if m else text
    args = None
    for attempt in (cand, cand[cand.find("{"):cand.rfind("}") + 1] if "{" in cand else ""):
        try:
            args = _json.loads(attempt)
            break
        except Exception:
            continue
    if not isinstance(args, dict):
        return None
    tr = ai_tools.execute_tool(tool_name, args)
    if tr.ok:
        return (tr.reply or "好嘞，给你安排上了。"), tr.meta
    return None


def _chat_react(user_msg: str) -> tuple[str, dict]:
    """
    带工具能力地处理一条用户消息。

    返回 (reply_text, meta)。meta 是工具执行的副作用标记（如 {"assigned_bounty": True}），
    供前端联动；纯聊天时为空 dict。

    两条传输路径，由工具注册表统一驱动：
      1. 意图关键词命中某工具 → 走 JSON 提取路径（让模型按 schema 填参数）。
         因为推理模型对原生 FC 的强制调用支持差，这条路对 deepseek 更稳。
      2. 没命中 → 走原生 FC 的 auto，让模型自己判断要不要调工具（纯聊天就聊天）。
    任一路径失败都安全降级到普通闲聊，绝不误操作、也不丢聊天能力。
    """
    import ai_tools

    if not ai_client.is_available():
        return _plain_chat(), {}

    # 路径 1：意图命中 → JSON 提取落地（最稳）
    forced = ai_tools.match_forced_tool(user_msg)
    if forced:
        done = _run_tool_via_json(forced)
        if done is not None:
            return done
        # 提取/落地失败 → 退回闲聊，不卡住用户
        return _plain_chat(), {}

    # 路径 2：没命中意图 → 原生 FC auto，让模型自己判断
    if not ai_client.supports_tools():
        return _plain_chat(), {}

    messages = _history_messages("（这是我刚发给你的话，请按需要决定聊天或调用工具。）")
    result = ai_client.chat_with_tools(
        messages,
        tools=ai_tools.openai_tools_spec(),
        system=SUPERVISOR_SYSTEM + _TOOL_HINT,
        max_tokens=800,
        tool_choice="auto",
    )
    if result is None:
        return _plain_chat(), {}

    calls = result.get("tool_calls") or []
    if calls:
        meta: dict = {}
        reply_parts: list[str] = []
        for call in calls:
            tr = ai_tools.execute_tool(call["name"], call["args"])
            if tr.ok:
                meta.update(tr.meta)
                if tr.reply:
                    reply_parts.append(tr.reply)
        if reply_parts:
            return "；".join(reply_parts), meta
        return (result.get("text") or "好嘞，我看看哈。").strip(), meta

    # 没调工具：用模型的自然语言回复（空则兜底）
    text = (result.get("text") or "").strip()
    if not text:
        text = _plain_chat()
    return text, {}


@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn):
    """
    用户在聊天框主动发消息：存入对话历史 → 搭子带工具能力处理（可能调工具操控 agent）
    → 存回复 → 返回。回复始终基于你俩的历史和全部业务数据，不只看这一句。
    """
    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "消息不能为空")
    ai_dialogue.append_turn("user", msg)
    reply_text, meta = _chat_react(msg)
    reply = ai_dialogue.append_turn("assistant", reply_text, trigger="chat")
    return ChatOut(
        reply=DialogueTurn(**reply),
        assigned_bounty=bool(meta.get("assigned_bounty")),
        bounty_content=str(meta.get("bounty_content", "")),
    )


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

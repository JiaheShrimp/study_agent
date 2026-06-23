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

# 每种触发来源的反馈概率（0~1）。控制搭子主动冒泡的频率。
# win_created 设为 1.0：记一条赢就必回，避免「偶尔不吭声」被当成坏了。
TRIGGER_PROBABILITY: dict[str, float] = {
    "win_created": 1.0,
}

# 各触发来源在 AI 不可用/超时时的兜底文案（伙伴口吻，不说教）。
# 正常情况下应由 AI 结合记忆生成个性化内容，这只是保证功能不崩。
FALLBACK_LINES: dict[str, list[str]] = {
    "win_created": [
        "看到啦，这条记下了，挺好的。👀",
        "嘿，又赢了一把，我有在认真看哦。",
        "记下来了，这种感觉是不是还挺爽的。",
        "不错呀，这一笔我替你高兴。",
    ],
}


def _build_win_scene(context: dict) -> str:
    """
    赢麻了触发：返回「这次发生了什么」的场景描述（scene）。
    业务数据与对话历史由 _history_messages 统一注入，这里只描述当下这件事。
    """
    level_label = {
        "small": "小赢（做到了一件事）",
        "medium": "中赢（明显进步）",
        "big": "特大赢（重大突破）",
        "future": "未来可赢（今天没做好，但以后能做到）",
    }.get(context.get("win_level", ""), "一条进步记录")
    content = context.get("content", "")
    recent = context.get("recent_count_today", 0)
    scene = [
        f"我刚刚在「赢麻了」里记录了一条 {level_label}，内容是：「{content}」。",
    ]
    if recent > 1:
        scene.append(f"这是我今天记录的第 {recent} 条了。")
    scene.append("请像朋友一样，结合这条记录和你对我的了解，自然地回我一句。")
    return "\n".join(scene)


# 触发来源 → 场景构造器，新增触发点时在此登记即可。
_PROMPT_BUILDERS = {
    "win_created": _build_win_scene,
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
        builder = _PROMPT_BUILDERS.get(trigger)
        scene = builder(context) if builder else "请随口跟我说一句。"
        line = _generate(scene, fallback_pool=FALLBACK_LINES.get(trigger, []))
        ai_dialogue.append_turn("assistant", line, trigger=trigger)
    except Exception:
        # 搭子出错绝不能影响主流程
        pass


def supervisor_react(trigger: str, context: dict | None = None, *, force: bool = False) -> None:
    """
    搭子统一入口。agent 任意操作都可以调用它。

    - trigger: 触发来源标识（如 "win_created"）
    - context: 该次操作的相关数据，交给 prompt 构造器
    - force:   True 时跳过概率判定，必定反馈

    按概率决定是否反馈；命中后在后台线程异步生成并写入对话历史，不阻塞主请求。
    前端聊天栏轮询 /ai/dialogue 即可看到新消息。
    """
    context = context or {}
    prob = TRIGGER_PROBABILITY.get(trigger, 0.0)
    if not force and random.random() > prob:
        return
    threading.Thread(target=_react_sync, args=(trigger, context), daemon=True).start()


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


@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn):
    """
    用户在聊天框主动发消息：存入对话历史 → 带历史生成回复 → 存回复 → 返回。
    回复始终基于你俩的历史和全部业务数据，不只看这一句。
    """
    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "消息不能为空")
    ai_dialogue.append_turn("user", msg)
    # 用户消息已写进历史，_history_messages 会带上它；这里 extra_user 只放轻量指引
    reply_text = _generate(
        "（请像朋友一样回复我上面这条消息，结合你对我的了解，自然地接着聊。）",
        fallback_pool=[
            "嗯嗯，我在听。",
            "哈哈，说说看？",
            "我懂你的意思。",
            "这个我记下了。",
        ],
    )
    reply = ai_dialogue.append_turn("assistant", reply_text, trigger="chat")
    return ChatOut(reply=DialogueTurn(**reply))


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

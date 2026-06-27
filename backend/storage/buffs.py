"""
Buff 系统：固定模板 + 效果定义
每个 buff 有唯一 id、名称、emoji、描述、类型、默认参数。
"""

from typing import Any

# ── Buff 类型说明 ────────────────────────────────────────────────
# task_score   : 影响本次任务得分（在 finishRun 时结算）
# daily_score  : 影响当天所有任务得分（在每条任务保存时叠加）
# goal_shield  : 今天不计入连续失败（结算目标时跳过）
# goal_boost   : 达标后目标额外多涨一档
# routine_double: 常规任务打卡 total_done +2
# lucky_dice   : 明天抽奖骰子各 +1（上限 5）

BUFF_TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "focus_sprint",
        "name": "专注冲刺",
        "emoji": "🎯",
        "desc": "本次任务零暂停时，得分额外 ×{coef}",
        "type": "task_score",
        "trigger": "no_pause",      # 触发条件
        "default_coef": 1.5,
    },
    {
        "id": "lightning",
        "name": "闪电完成",
        "emoji": "⚡",
        "desc": "本次任务提前完成时，得分额外 ×{coef}",
        "type": "task_score",
        "trigger": "early_finish",
        "default_coef": 1.5,
    },
    {
        "id": "daily_burn",
        "name": "今日燃烧",
        "emoji": "🔥",
        "desc": "今天所有任务完成得分均 ×{coef}",
        "type": "daily_score",
        "trigger": "always",
        "default_coef": 1.2,
    },
    {
        "id": "death_shield",
        "name": "免死金牌",
        "emoji": "🛡️",
        "desc": "今天即使未达学习目标，也不计入连续失败次数",
        "type": "goal_shield",
        "trigger": "always",
        "default_coef": 1.0,        # 无系数，纯免伤
    },
    {
        "id": "double_punch",
        "name": "加速成长",
        "emoji": "🌱",
        "desc": "今天常规任务打卡计为双倍（total_done +2）",
        "type": "routine_double",
        "trigger": "always",
        "default_coef": 1.0,
    },
    {
        "id": "lucky_dice",
        "name": "幸运加注",
        "emoji": "🎰",
        "desc": "明天抽奖时三个骰子各 +1（上限 5）",
        "type": "lucky_dice",
        "trigger": "always",
        "default_coef": 1.0,
    },
]

BUFF_MAP: dict[str, dict] = {b["id"]: b for b in BUFF_TEMPLATES}
ACTIVE_BUFF_TYPES = {"task_score", "daily_score", "lucky_dice"}
ACTIVE_BUFF_TEMPLATES = [b for b in BUFF_TEMPLATES if b["type"] in ACTIVE_BUFF_TYPES]


def get_buff(buff_id: str) -> dict | None:
    return BUFF_MAP.get(buff_id)


# 每种 buff 的系数随机范围（min, max, step）
# 无实际系数的 buff（goal_shield / routine_double / lucky_dice）coef 固定 1.0
_COEF_RANGES: dict[str, tuple[float, float, float]] = {
    "focus_sprint": (1.3, 2.0, 0.1),
    "lightning":    (1.3, 2.0, 0.1),
    "daily_burn":   (1.1, 1.5, 0.1),
    "death_shield": (1.0, 1.0, 0.0),
    "double_punch": (1.0, 1.0, 0.0),
    "lucky_dice":   (1.0, 1.0, 0.0),
}


def random_buff() -> dict:
    import random
    tpl = random.choice(ACTIVE_BUFF_TEMPLATES)
    lo, hi, step = _COEF_RANGES[tpl["id"]]
    if step == 0.0:
        coef = lo
    else:
        steps = round((hi - lo) / step)
        coef = round(lo + random.randint(0, steps) * step, 2)
    result = dict(tpl)
    result["coef"] = coef
    result["desc"] = tpl["desc"].format(coef=coef)
    return result

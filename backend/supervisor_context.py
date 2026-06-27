"""
搭子上下文聚合。

把用户在 agent 里的**全部记录**原样汇总成一段文字，喂给 AI，
让它基于完整的成长轨迹自由发挥，像一个真正了解你这个人的朋友。

设计原则：
  - 不筛选、不分「今天 / 过往」——数据量很小（几十条、几十 KB），
    直接把全部记录按时间倒序列出，AI 自己从整体里找话说。
  - 只读：所有数据都通过 storage 层读取，不写任何文件。

注：未来记录量很大时再加上限截断（见 MAX_WINS），目前阈值给得很宽。
"""

from __future__ import annotations
import random
from datetime import datetime

from storage.records import load_wins
from storage.tasks import load_routines, load_task_runs

_LEVEL_CN = {
    "small": "小赢",
    "medium": "中赢",
    "big": "特大赢",
    "future": "未来可赢",
}

# 赢麻了喂给 AI 的抽样预算：单次最多喂多少条进 prompt。
# 不超过这个数就全给；超过则「最近 RECENT_KEEP 条固定 + 其余随机抽到凑满预算」，
# 每次抽样不同，促使 AI 均匀覆盖历史、减少重复。
SAMPLE_BUDGET = 40
RECENT_KEEP = 10


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _all_wins_block() -> str | None:
    """
    赢麻了记录喂给 AI：最近若干条总是带上（保时效），其余随机抽样。

    这样每次喂的「老记录」都不同，逼 AI 覆盖到不同的事、减少老薅那几条造成的
    重复；同时最新动态始终在场。数据少时（≤ SAMPLE_BUDGET）就全给。
    """
    wins = load_wins()
    if not wins:
        return None
    wins.sort(key=lambda w: w.get("created_at", ""), reverse=True)
    total = len(wins)

    if total <= SAMPLE_BUDGET:
        picked = wins
    else:
        # 最近 RECENT_KEEP 条固定保留，剩余预算从更早记录里随机抽
        recent = wins[:RECENT_KEEP]
        older = wins[RECENT_KEEP:]
        n_sample = max(0, min(len(older), SAMPLE_BUDGET - len(recent)))
        sampled = random.sample(older, n_sample) if n_sample else []
        picked = recent + sampled
        # 整体按时间倒序展示
        picked.sort(key=lambda w: w.get("created_at", ""), reverse=True)

    def fmt(w: dict) -> str:
        day = w.get("created_at", "")[:10]
        level = _LEVEL_CN.get(w.get("win_level", ""), "记录")
        return f"{day} [{level}] {w.get('content', '')}"

    header = f"【他记录的全部进步（赢麻了），共 {total} 条】"
    if len(picked) < total:
        header += f"（下面是最近的 + 随机抽取的共 {len(picked)} 条，每次抽取不同）"
    return header + "\n" + "\n".join(fmt(w) for w in picked)


def _focus_block() -> str | None:
    """专注时长：每天累计多少分钟，按日期倒序全列 + 总计。"""
    runs = [
        r for r in load_task_runs()
        if r.get("success") and r.get("count_in_effective", True)
    ]
    if not runs:
        return None

    per_day: dict[str, int] = {}
    total_secs = 0
    for r in runs:
        d = r.get("date", "")
        secs = r.get("actual_seconds", 0) or 0
        total_secs += secs
        per_day[d] = per_day.get(d, 0) + secs

    total_hours = round(total_secs / 3600, 1)
    days_line = "、".join(
        f"{d}≈{round(s / 60)}分"
        for d, s in sorted(per_day.items(), reverse=True)
    )
    return (
        f"【他的专注时长】累计约 {total_hours} 小时，"
        f"覆盖 {len(per_day)} 天。每天大致：{days_line}。"
    )


def _routines_block() -> str | None:
    """常规习惯：每个习惯的连续 / 历史最长 / 累计 / 今日状态。"""
    data = load_routines()
    routines = data.get("routines", [])
    if not routines:
        return None
    today = _today()
    lines = []
    for r in routines:
        streak = r.get("streak", 0)
        best = r.get("best_streak", 0)
        total = r.get("total_done", 0)
        done_today = r.get("last_done_date") == today
        flag = "今天已打卡" if done_today else "今天还没打卡"
        lines.append(
            f"「{r.get('content', '')}」当前连续 {streak} 天"
            f"（历史最长 {best} 天，累计打卡 {total} 次），{flag}"
        )
    return "【他的常规习惯】\n" + "\n".join(lines)


def build_summary() -> str:
    """
    汇总成一段给 AI 读的完整记录。无数据时返回友好兜底。

    末尾附上「可量化数据洞察」（supervisor_stats）——这些是 Python 预先算好的
    确切数字结论（历史最长专注、距纪录差多少、近一周日均、连续天数……），
    让 AI 能放心引用具体数据，而不必自己去算。
    """
    from supervisor_stats import insights_block
    parts = [
        b for b in (_all_wins_block(), _focus_block(), _routines_block(), insights_block())
        if b
    ]
    if not parts:
        return "（他还没在 App 里留下多少记录，你可以鼓励他开个头。）"
    return "\n\n".join(parts)

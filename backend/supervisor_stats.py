"""
搭子用的「可量化数据洞察」统计。

这一层做 AI **不擅长**的事：从原始记录里算出确切的数字结论
（历史最长专注是哪天、最近一周日均多少、距纪录还差多少、连续记录天数……），
把这些"硬数据洞察"整理成一句句中文，喂给 AI。

AI 拿到这些现成结论后，**偶尔**挑一条结合语气自然说出来
（"你历史最长是 X 天前那次 90 分钟，今天再撑 20 分就破了！"），
而不用自己去算——算交给 Python，措辞交给 AI。

设计：
  - 纯只读，全部走 storage 层。
  - 每条洞察 = 一句**陈述事实**的中文，不带情绪、不带说教，
    让 AI 自己决定要不要用、用正面还是调侃的口吻包装。
  - 数据不足时该条洞察直接不产出（返回的 list 里就没有），不硬凑。
"""

from __future__ import annotations
from datetime import datetime, date as Date, timedelta

from storage.records import load_wins
from storage.tasks import load_routines, load_task_runs


def _today() -> Date:
    return datetime.now().date()


def _parse_day(s: str) -> Date | None:
    try:
        return Date.fromisoformat(s[:10])
    except Exception:
        return None


# ── 专注时长洞察 ──────────────────────────────────────────────

def _focus_per_day() -> dict[Date, int]:
    """{日期: 当天计入有效的专注秒数}。"""
    per_day: dict[Date, int] = {}
    for r in load_task_runs():
        if not (r.get("success") and r.get("count_in_effective", True)):
            continue
        d = _parse_day(r.get("date", ""))
        if not d:
            continue
        per_day[d] = per_day.get(d, 0) + (r.get("actual_seconds", 0) or 0)
    return {d: s for d, s in per_day.items() if s > 0}


def _focus_insights() -> list[str]:
    per_day = _focus_per_day()
    if not per_day:
        return []
    out: list[str] = []
    today = _today()

    # 历史单日最长专注：哪天、多少分钟、距今多少天
    best_day = max(per_day, key=lambda d: per_day[d])
    best_min = round(per_day[best_day] / 60)
    days_ago = (today - best_day).days
    when = "今天" if days_ago == 0 else ("昨天" if days_ago == 1 else f"{days_ago} 天前")
    out.append(
        f"他单日专注时长的历史纪录是 {when}（{best_day.isoformat()}）创下的 {best_min} 分钟。"
    )

    # 今天已专注多少，距破纪录还差多少
    today_secs = per_day.get(today, 0)
    if today_secs > 0:
        today_min = round(today_secs / 60)
        if best_day != today and today_secs < per_day[best_day]:
            gap = round((per_day[best_day] - today_secs) / 60)
            out.append(
                f"他今天已专注 {today_min} 分钟，再专注 {gap} 分钟就能打破单日历史纪录。"
            )
        elif best_day == today:
            out.append(f"他今天专注了 {today_min} 分钟，正是历史最高的一天。")

    # 最近 7 天 vs 之前的日均（看状态是上扬还是回落）
    last7 = [s for d, s in per_day.items() if 0 <= (today - d).days < 7]
    prev7 = [s for d, s in per_day.items() if 7 <= (today - d).days < 14]
    if last7:
        avg7 = round(sum(last7) / len(last7) / 60)
        out.append(f"他最近 7 天里有 {len(last7)} 天在专注，日均约 {avg7} 分钟。")
        if prev7:
            avg_prev = round(sum(prev7) / len(prev7) / 60)
            if avg_prev > 0:
                diff = avg7 - avg_prev
                if diff >= 5:
                    out.append(f"对比上一周（日均 {avg_prev} 分），他这周日均多了约 {diff} 分钟，状态在上扬。")
                elif diff <= -5:
                    out.append(f"对比上一周（日均 {avg_prev} 分），他这周日均少了约 {-diff} 分钟，有点回落。")

    # 连续有专注的天数（从今天或昨天往前数）
    streak = _focus_streak(set(per_day.keys()), today)
    if streak >= 2:
        out.append(f"他已经连续 {streak} 天都有专注记录了。")

    return out


def _focus_streak(days: set[Date], today: Date) -> int:
    """从今天（或昨天）往前数，连续有专注的天数。"""
    if not days:
        return 0
    if today in days:
        cur = today
    elif (today - timedelta(days=1)) in days:
        cur = today - timedelta(days=1)
    else:
        return 0
    n = 0
    while cur in days:
        n += 1
        cur -= timedelta(days=1)
    return n


# ── 赢麻了洞察 ────────────────────────────────────────────────

def _wins_insights() -> list[str]:
    wins = load_wins()
    if not wins:
        return []
    out: list[str] = []
    today = _today()

    days = [d for d in (_parse_day(w.get("created_at", "")) for w in wins) if d]
    if not days:
        return []

    total = len(wins)
    out.append(f"他在「赢麻了」里一共记录了 {total} 条进步。")

    # 今天记了几条
    today_cnt = sum(1 for d in days if d == today)
    if today_cnt > 0:
        out.append(f"他今天已经记了 {today_cnt} 条赢。")

    # 距上次记录隔了多久（提醒"好久没记了"或"最近很勤"）
    last_day = max(days)
    gap = (today - last_day).days
    if gap >= 3:
        out.append(f"他已经 {gap} 天没在「赢麻了」里记东西了，上一条是 {last_day.isoformat()}。")

    # 记录最多的一天
    from collections import Counter
    cnt = Counter(days)
    busiest, busiest_n = cnt.most_common(1)[0]
    if busiest_n >= 3:
        ba = (today - busiest).days
        when = "今天" if ba == 0 else f"{ba} 天前"
        out.append(f"他记赢最多的一天是 {when}，那天记了 {busiest_n} 条。")

    return out


# ── 习惯洞察 ──────────────────────────────────────────────────

def _routine_insights() -> list[str]:
    data = load_routines()
    routines = data.get("routines", [])
    if not routines:
        return []
    out: list[str] = []
    for r in routines:
        name = r.get("content", "")
        streak = r.get("streak", 0)
        best = r.get("best_streak", 0)
        # 接近或追平历史最长 → 值得一提
        if streak > 0 and best > 0:
            if streak >= best:
                out.append(f"习惯「{name}」当前连续 {streak} 天，正是历史最长。")
            elif best - streak <= 2:
                out.append(
                    f"习惯「{name}」当前连续 {streak} 天，再坚持 {best - streak} 天就追平历史最长（{best} 天）。"
                )
    return out


# ── 汇总 ──────────────────────────────────────────────────────

def compute_insights() -> list[str]:
    """算出所有"硬数据洞察"，返回一句句中文事实陈述。无数据则空 list。"""
    insights: list[str] = []
    insights += _focus_insights()
    insights += _wins_insights()
    insights += _routine_insights()
    return insights


def insights_block() -> str | None:
    """把洞察拼成喂给 AI 的一段文字；无洞察返回 None。"""
    items = compute_insights()
    if not items:
        return None
    body = "\n".join(f"- {s}" for s in items)
    return (
        "【关于他的可量化数据洞察（已替你算好，是确切事实，可放心引用具体数字）】\n"
        + body
    )

"""
搭子用的「可引用数据事实」统计。

这一层做 AI **不擅长**的事：从原始记录里算出确切的数字结论
（历史最长专注是哪天、最近一周日均多少、距纪录还差多少、连续记录天数……），
把这些硬数据整理成结构化事实卡片，喂给 AI。

AI 拿到这些现成事实后，**偶尔**挑一条结合语气自然说出来
（"你历史最长是 X 天前那次 90 分钟，今天再撑 20 分就破了！"），
而不用自己去算——算交给 Python，措辞交给 AI。

设计：
  - 纯只读，全部走 storage 层。
  - 每条事实都带 type / scope / metric / unit / meaning 等字段，
    减少 AI 把不同指标混在一起理解的概率。
  - 数据不足时该条事实直接不产出（返回的 list 里就没有），不硬凑。
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


def _fact_line(fact_type: str, scope: str, **fields) -> str:
    """把一条事实格式化成稳定的 key=value 卡片，方便模型按字段理解。"""
    parts = [f"type={fact_type}", f"scope={scope}"]
    for key, value in fields.items():
        if value is None or value == "":
            continue
        parts.append(f"{key}={value}")
    return " | ".join(parts)


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
        _fact_line(
            "focus.daily_record",
            "focus_time",
            metric="single_day_effective_focus_max",
            value=best_min,
            unit="minutes",
            date=best_day.isoformat(),
            relative_day=when,
            meaning="历史最高的单日有效专注总时长",
        )
    )

    # 今天已专注多少，距破纪录还差多少
    today_secs = per_day.get(today, 0)
    if today_secs > 0:
        today_min = round(today_secs / 60)
        if best_day != today and today_secs < per_day[best_day]:
            gap = round((per_day[best_day] - today_secs) / 60)
            out.append(
                _fact_line(
                    "focus.today_vs_record",
                    "focus_time",
                    metric="minutes_needed_to_break_single_day_record",
                    today_value=today_min,
                    record_value=best_min,
                    gap_value=gap,
                    unit="minutes",
                    date=today.isoformat(),
                    record_date=best_day.isoformat(),
                    meaning="今天有效专注距离单日历史纪录还差多少分钟",
                )
            )
        elif best_day == today:
            out.append(
                _fact_line(
                    "focus.today_record_matched",
                    "focus_time",
                    metric="today_effective_focus_minutes",
                    value=today_min,
                    unit="minutes",
                    date=today.isoformat(),
                    meaning="今天有效专注已达到单日历史最高",
                )
            )

    # 最近 7 天 vs 之前的日均（看状态是上扬还是回落）
    last7 = [s for d, s in per_day.items() if 0 <= (today - d).days < 7]
    prev7 = [s for d, s in per_day.items() if 7 <= (today - d).days < 14]
    if last7:
        avg7 = round(sum(last7) / len(last7) / 60)
        out.append(
            _fact_line(
                "focus.recent_7d_average",
                "focus_time",
                metric="average_effective_focus_minutes_per_active_day",
                active_days=len(last7),
                window_days=7,
                value=avg7,
                unit="minutes_per_active_day",
                meaning="最近7天有专注记录的日子里，平均每天有效专注分钟数",
            )
        )
        if prev7:
            avg_prev = round(sum(prev7) / len(prev7) / 60)
            if avg_prev > 0:
                diff = avg7 - avg_prev
                if diff >= 5:
                    out.append(
                        _fact_line(
                            "focus.weekly_average_change",
                            "focus_time",
                            metric="recent_7d_vs_previous_7d_average_delta",
                            current_average=avg7,
                            previous_average=avg_prev,
                            delta=diff,
                            unit="minutes_per_active_day",
                            trend="up",
                            meaning="最近7天有效专注日均相对上一组7天的变化",
                        )
                    )
                elif diff <= -5:
                    out.append(
                        _fact_line(
                            "focus.weekly_average_change",
                            "focus_time",
                            metric="recent_7d_vs_previous_7d_average_delta",
                            current_average=avg7,
                            previous_average=avg_prev,
                            delta=diff,
                            unit="minutes_per_active_day",
                            trend="down",
                            meaning="最近7天有效专注日均相对上一组7天的变化",
                        )
                    )

    # 连续有专注的天数（从今天或昨天往前数）
    streak = _focus_streak(set(per_day.keys()), today)
    if streak >= 2:
        out.append(
            _fact_line(
                "focus.activity_streak",
                "focus_time",
                metric="consecutive_days_with_effective_focus",
                value=streak,
                unit="days",
                meaning="从今天或昨天往前数，连续有有效专注记录的天数",
            )
        )

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
    out.append(
        _fact_line(
            "wins.total_count",
            "wins",
            metric="total_win_records",
            value=total,
            unit="records",
            meaning="赢麻了里累计记录的进步条数",
        )
    )

    # 今天记了几条
    today_cnt = sum(1 for d in days if d == today)
    if today_cnt > 0:
        out.append(
            _fact_line(
                "wins.today_count",
                "wins",
                metric="today_win_records",
                value=today_cnt,
                unit="records",
                date=today.isoformat(),
                meaning="今天在赢麻了里记录的进步条数",
            )
        )

    # 距上次记录隔了多久（提醒"好久没记了"或"最近很勤"）
    last_day = max(days)
    gap = (today - last_day).days
    if gap >= 3:
        out.append(
            _fact_line(
                "wins.days_since_last_record",
                "wins",
                metric="days_since_last_win_record",
                value=gap,
                unit="days",
                last_record_date=last_day.isoformat(),
                meaning="距离上一次赢麻了记录过去了多少天",
            )
        )

    # 记录最多的一天
    from collections import Counter
    cnt = Counter(days)
    busiest, busiest_n = cnt.most_common(1)[0]
    if busiest_n >= 3:
        ba = (today - busiest).days
        when = "今天" if ba == 0 else f"{ba} 天前"
        out.append(
            _fact_line(
                "wins.busiest_day",
                "wins",
                metric="max_win_records_in_single_day",
                value=busiest_n,
                unit="records",
                date=busiest.isoformat(),
                relative_day=when,
                meaning="单日赢麻了记录条数最多的一天",
            )
        )

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
                out.append(
                    _fact_line(
                        "routine.streak_record_matched",
                        "routine_habit",
                        subject=name,
                        metric="current_streak_days_equals_best_streak_days",
                        current_streak=streak,
                        best_streak=best,
                        unit="days",
                        meaning="这个常规习惯当前连续天数已达到历史最长",
                    )
                )
            elif best - streak <= 2:
                out.append(
                    _fact_line(
                        "routine.streak_near_record",
                        "routine_habit",
                        subject=name,
                        metric="days_needed_to_match_best_streak",
                        current_streak=streak,
                        best_streak=best,
                        gap_value=best - streak,
                        unit="days",
                        meaning="这个常规习惯距离追平历史最长连续天数还差多少天",
                    )
                )
    return out


# ── 汇总 ──────────────────────────────────────────────────────

def compute_insights() -> list[str]:
    """算出所有结构化数据事实。无数据则空 list。"""
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
        "【关于他的可引用数据事实（结构化；数字已算好，可按字段引用）】\n"
        + body
    )

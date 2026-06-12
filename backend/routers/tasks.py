import uuid
import random
from datetime import date as Date, datetime as _Datetime, timedelta
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


def _game_today() -> str:
    """游戏日以 08:00 为起点，00:00-07:59 属于昨天的游戏日。"""
    now = _Datetime.now()
    if now.hour < 8:
        return str((now - timedelta(days=1)).date())
    return str(now.date())

from storage.tasks import (
    load_templates, save_templates,
    load_daily_tasks, save_daily_tasks,
    load_bounty_pool, save_bounty_pool,
    load_daily_bounties, save_daily_bounties,
    load_routines, save_routines,
    load_excluded_dates, save_excluded_dates,
    _read, _write, DATA_DIR,
)
from storage.config import load_config

router = APIRouter(prefix="/tasks", tags=["tasks"])

# ── 数据模型 ─────────────────────────────────────────────────

class TaskTemplate(BaseModel):
    id: str
    content: str
    hours: float        # 预计时长（h）
    stars: int          # 重要程度 1-5

class TaskTemplateCreate(BaseModel):
    content: str
    hours: float
    stars: int

class DailyTask(BaseModel):
    id: str
    content: str
    hours: float
    stars: int
    done: bool
    from_template: bool
    run_status: str = "none"   # none | running_failed | completed

class DailyTaskCreate(BaseModel):
    content: str
    hours: float
    stars: int

class BountyTask(BaseModel):
    id: str
    content: str
    hours: float
    stars: int
    buff: str           # buff 描述，如"完成后今日所有任务奖励×1.1"

class BountyCreate(BaseModel):
    content: str
    hours: float
    stars: int
    buff: str

class DailyBounty(BaseModel):
    id: str             # 引用 bounty pool 的 id
    content: str
    hours: float
    stars: int
    buff: str
    status: Literal["pending", "accepted", "skipped"]

# ── 任务模板 ─────────────────────────────────────────────────

@router.get("/templates", response_model=list[TaskTemplate])
def list_templates():
    return load_templates()

@router.post("/templates", response_model=TaskTemplate, status_code=201)
def create_template(body: TaskTemplateCreate):
    templates = load_templates()
    t = {"id": str(uuid.uuid4()), **body.model_dump()}
    templates.append(t)
    save_templates(templates)
    return t

@router.put("/templates/{tid}", response_model=TaskTemplate)
def update_template(tid: str, body: TaskTemplateCreate):
    templates = load_templates()
    for i, t in enumerate(templates):
        if t["id"] == tid:
            templates[i] = {"id": tid, **body.model_dump()}
            save_templates(templates)
            return templates[i]
    raise HTTPException(404, "模板不存在")

@router.delete("/templates/{tid}", status_code=204)
def delete_template(tid: str):
    templates = load_templates()
    templates = [t for t in templates if t["id"] != tid]
    save_templates(templates)

# ── 当日任务 ─────────────────────────────────────────────────

@router.get("/daily/dates", response_model=list[str])
def get_daily_dates():
    """返回所有有任务记录的日期列表。"""
    from storage.tasks import _read, DAILY_TASKS_FILE
    all_days: dict = _read(DAILY_TASKS_FILE, {})
    return sorted(all_days.keys(), reverse=True)


@router.get("/daily", response_model=list[DailyTask])
def get_daily_tasks(date: str | None = None):
    today = date or _game_today()
    return load_daily_tasks(today)

@router.post("/daily/init", response_model=list[DailyTask])
def init_daily_tasks(date: str | None = None):
    """用模板初始化当日任务（每天第一次打开时调用）。"""
    today = date or _game_today()
    existing = load_daily_tasks(today)
    if existing:
        return existing  # 已初始化，不覆盖
    templates = load_templates()
    tasks = [
        {
            "id": str(uuid.uuid4()),
            "content": t["content"],
            "hours": t["hours"],
            "stars": t["stars"],
            "done": False,
            "from_template": True,
            "run_status": "none",
        }
        for t in templates
    ]
    save_daily_tasks(today, tasks)
    return tasks

@router.post("/daily", response_model=DailyTask, status_code=201)
def add_daily_task(body: DailyTaskCreate, date: str | None = None):
    today = date or _game_today()
    tasks = load_daily_tasks(today)
    task = {"id": str(uuid.uuid4()), **body.model_dump(), "done": False, "from_template": False, "run_status": "none"}
    tasks.append(task)
    save_daily_tasks(today, tasks)
    return task

@router.put("/daily/{task_id}", response_model=DailyTask)
def update_daily_task(task_id: str, body: DailyTaskCreate, date: str | None = None):
    today = date or _game_today()
    tasks = load_daily_tasks(today)
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i] = {**t, **body.model_dump()}
            save_daily_tasks(today, tasks)
            return tasks[i]
    raise HTTPException(404, "任务不存在")

@router.patch("/daily/{task_id}/done", response_model=DailyTask)
def toggle_done(task_id: str, date: str | None = None):
    import os as _os3
    from datetime import datetime as _Dt
    today = date or _game_today()
    tasks = load_daily_tasks(today)
    for i, t in enumerate(tasks):
        if t["id"] != task_id:
            continue
        new_done = not tasks[i]["done"]
        tasks[i]["done"] = new_done

        # 同步写/删 task_runs 中的 manual 记录
        runs_path = _os3.path.join(DATA_DIR, "task_runs.json")
        runs: list = _read(runs_path, [])

        if new_done:
            # 写入一条 manual run，时间戳用现在
            now = _Dt.now()
            secs = int(t.get("hours", 1.0) * 3600)
            started = (now - timedelta(seconds=secs)).isoformat()
            ended   = now.isoformat()
            # 防止重复：先移除同 task_id 的旧 manual 记录
            runs = [r for r in runs if not (r.get("task_id") == task_id and r.get("source") == "manual")]
            # manual 分数：只考虑星级 × 有效段数 × 当日倍数，不考虑暂停/休息加成
            cfg = load_config()
            mode = cfg.get("effective_time_mode", "actual")
            task_hours = t.get("hours", 1.0)
            task_stars = t.get("stars", 3)
            planned_secs = task_hours * 3600
            effective_secs = min(secs, planned_secs) if mode == "planned" else secs
            import math as _m
            segments = max(1, _m.ceil(effective_secs / 3600 / 0.5))
            # 取今日倍数（存在 config.json 的 daily_bonus 字段里）
            saved_bonus = cfg.get("daily_bonus")
            multiplier = 1.0
            if saved_bonus and saved_bonus.get("date") == today:
                multiplier = saved_bonus.get("multiplier", 1.0)
            manual_score = round(task_stars * segments * multiplier)
            runs.append({
                "task_id": task_id,
                "task_content": t.get("content", ""),
                "date": today,
                "success": True,
                "started_at": started,
                "ended_at": ended,
                "actual_seconds": secs,
                "pause_count": 0,
                "pause_seconds": 0,
                "task_hours": task_hours,
                "task_stars": task_stars,
                "end_reason": "complete",
                "rest_remaining_secs": 0,
                "multiplier": multiplier,
                "source": "manual",
                "score": manual_score,
            })
            tasks[i]["run_status"] = "completed"
        else:
            # 取消勾选：删掉对应的 manual run，恢复状态
            runs = [r for r in runs if not (r.get("task_id") == task_id and r.get("source") == "manual")]
            tasks[i]["run_status"] = "none"

        _write(runs_path, runs)
        save_daily_tasks(today, tasks)
        return tasks[i]
    raise HTTPException(404, "任务不存在")

@router.delete("/daily/{task_id}", status_code=204)
def delete_daily_task(task_id: str, date: str | None = None):
    today = date or _game_today()
    tasks = load_daily_tasks(today)
    save_daily_tasks(today, [t for t in tasks if t["id"] != task_id])

# ── 赏金任务（新系统）────────────────────────────────────────
# 内容从历史 task_runs 去重抽取，buff 系统随机分配
# 每天生成 0-2 个赏金任务，每个分配随机弹出时间窗口（游戏日内）
# 前端轮询 /bounty/daily/pending，有到期未弹的就弹出

from storage.buffs import BUFF_TEMPLATES, random_buff
from datetime import datetime as Datetime, time as Time
import ai_client


def _all_task_contents() -> list[dict]:
    """从所有历史执行记录中提取去重的任务内容。"""
    import os as _os2
    path = _os2.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    seen: dict[str, dict] = {}
    for r in runs:
        c = r.get("task_content", "").strip()
        if c and c not in seen:
            seen[c] = {
                "content": c,
                "hours": r.get("task_hours", 1.0),
                "stars": r.get("task_stars", 3),
            }
    return list(seen.values())


def _game_day_range(date_str: str) -> tuple[Datetime, Datetime]:
    """返回游戏日的开始/结束时间（当天 08:00 ~ 次日 08:00）。"""
    from datetime import timedelta
    d = Date.fromisoformat(date_str)
    start = Datetime.combine(d, Time(8, 0))
    end   = Datetime.combine(d + timedelta(days=1), Time(8, 0))
    return start, end


def _generate_popup_time(start: Datetime, end: Datetime) -> str:
    """在游戏日内随机生成一个弹出时间（ISO 字符串）。"""
    total = int((end - start).total_seconds())
    offset = random.randint(0, total - 1)
    from datetime import timedelta
    t = start + timedelta(seconds=offset)
    return t.isoformat()


def _ai_select_bounties(history: list[dict], today: str) -> list[dict] | None:
    """
    调用 AI 从历史任务中筛选并创作赏金任务。
    返回 list[{content, hours, stars}]（0-2 条），失败返回 None（调用方降级）。
    """
    history_lines = "\n".join(
        f"- {item['content']}（{item['hours']}h，重要度{item['stars']}星）"
        for item in history
    )
    prompt = f"""今天是 {today}，我是一个游戏化自我管理 app 的用户。
下面是我历史上执行过的任务列表：

{history_lines}

请帮我从中挑选或创作 0-2 个今天的"赏金任务"，遵守以下规则：
1. 排除明显是一次性的任务（例如某个具体项目的某个里程碑、特定活动、特定日期相关内容）
2. 优先选择可以重复做、有持续价值的任务（练习、学习、整理类）
3. 可以在历史任务基础上进行创新改编，让任务更有趣，但保持合理的时长（0.5-4h）和重要度（1-5星）
4. 如果历史任务都是一次性的，可以创作 0 个

以 JSON 数组格式返回，每个元素包含 content（字符串）、hours（数字）、stars（整数1-5）：
[{{"content": "...", "hours": 1.0, "stars": 3}}]

如果返回 0 个，返回空数组 []。只返回 JSON，不要其他说明。"""

    result = ai_client.chat_json(prompt)
    if not isinstance(result, list):
        return None
    # 校验并清洗每条
    cleaned = []
    for item in result[:2]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        hours = float(item.get("hours", 1.0))
        hours = max(0.25, min(8.0, hours))
        stars = int(item.get("stars", 3))
        stars = max(1, min(5, stars))
        cleaned.append({"content": content, "hours": hours, "stars": stars})
    return cleaned


class BountyBuff(BaseModel):
    id: str
    name: str
    emoji: str
    desc: str
    type: str
    trigger: str
    coef: float


class DailyBountyNew(BaseModel):
    id: str
    content: str
    hours: float
    stars: int
    buff: BountyBuff
    status: str          # pending | accepted | done | expired
    popup_at: str        # ISO datetime，前端据此决定何时弹出
    ai_generated: bool = False  # 标记是否由 AI 生成/筛选


@router.get("/bounty/daily", response_model=list[DailyBountyNew])
def get_daily_bounties(date: str | None = None):
    today = date or _game_today()
    data = load_daily_bounties(today)
    return data.get("bounties", [])


@router.post("/bounty/daily/generate", response_model=list[DailyBountyNew])
def generate_daily_bounties(date: str | None = None):
    """
    生成当日赏金任务（已生成则直接返回）。
    有 AI key：调用 AI 筛选/创作，过滤一次性任务并可创新。
    无 AI key：随机从历史任务中抽取（规则降级模式）。
    """
    today = date or _game_today()
    existing = load_daily_bounties(today)
    if existing.get("generated"):
        return existing.get("bounties", [])

    history = _all_task_contents()
    start, end = _game_day_range(today)

    # 尝试 AI 模式
    selected: list[dict] | None = None
    ai_generated = False
    if history and ai_client.is_available():
        selected = _ai_select_bounties(history, today)
        if selected is not None:
            ai_generated = True

    # 降级：随机抽取
    if selected is None:
        if not history:
            save_daily_bounties(today, {"generated": True, "bounties": []})
            return []
        count = random.randint(0, min(2, len(history)))
        selected = random.sample(history, count)

    bounties = []
    for item in selected:
        buff_tpl = random_buff()
        bounties.append({
            "id": str(uuid.uuid4()),
            "content": item["content"],
            "hours": item["hours"],
            "stars": item["stars"],
            "buff": buff_tpl,
            "status": "pending",
            "popup_at": _generate_popup_time(start, end),
            "ai_generated": ai_generated,
        })

    save_daily_bounties(today, {"generated": True, "bounties": bounties})
    return bounties


@router.get("/bounty/daily/pending", response_model=list[DailyBountyNew])
def get_pending_bounties(date: str | None = None):
    """返回当前时刻已到弹出时间、且状态为 pending 的赏金任务。"""
    today = date or _game_today()
    data = load_daily_bounties(today)
    now = Datetime.now().isoformat()
    return [
        b for b in data.get("bounties", [])
        if b["status"] == "pending" and b.get("popup_at", "") <= now
    ]


@router.patch("/bounty/daily/{bounty_id}", response_model=DailyBountyNew)
def respond_bounty(bounty_id: str, status: Literal["accepted", "expired"], date: str | None = None):
    """接受（accepted）或过期消失（expired）。"""
    today = date or _game_today()
    data = load_daily_bounties(today)
    for i, b in enumerate(data["bounties"]):
        if b["id"] == bounty_id:
            data["bounties"][i]["status"] = status
            save_daily_bounties(today, data)
            return data["bounties"][i]
    raise HTTPException(404, "赏金任务不存在")


@router.patch("/bounty/daily/{bounty_id}/done", response_model=DailyBountyNew)
def complete_bounty(bounty_id: str, date: str | None = None):
    """标记赏金任务完成（在对应 task_run 保存后调用）。"""
    today = date or _game_today()
    data = load_daily_bounties(today)
    for i, b in enumerate(data["bounties"]):
        if b["id"] == bounty_id:
            data["bounties"][i]["status"] = "done"
            save_daily_bounties(today, data)
            return data["bounties"][i]
    raise HTTPException(404, "赏金任务不存在")

# ── 任务执行记录 ─────────────────────────────────────────────

import math as _math

class TaskRunResult(BaseModel):
    task_id: str
    task_content: str = ""
    date: str
    success: bool
    started_at: str = ""
    ended_at: str = ""
    actual_seconds: int
    pause_count: int
    pause_seconds: int
    task_hours: float = 1.0
    task_stars: int = 3
    end_reason: str = "complete"          # complete | early | giveup | failed
    rest_remaining_secs: int = 0          # 结束时剩余休息预算（秒）
    multiplier: float = 1.0              # 当日倍数
    source: str = "runner"               # runner | manual
    score: int = 0                       # 本次执行得分（失败/中断为0）


class ScoreBreakdown(BaseModel):
    base: float
    bonus_no_pause: float
    bonus_few_pause: float
    bonus_rest_saved: float
    bonus_early: float
    multiplier: float
    total: int


def _calc_score(body: TaskRunResult) -> ScoreBreakdown:
    """
    基础分 = stars × ceil(有效时长 / 0.5h)
    有效时长与有效时间口径对齐：
      actual  口径：actual_seconds
      planned 口径：min(actual_seconds, task_hours × 3600)
    加成系数（相乘叠加）：
      零暂停       pause_count == 0              ×1.3
      少暂停       pause_count ≤ ceil(hours/0.5)-1（且>0）×1.1
      休息省用     结束时剩余预算 > 0             ×1.2
      提前完成     end_reason == early            ×1.1
      每日倍数     multiplier                     ×multiplier
    失败/中断任务不计分。
    """
    if not body.success:
        return ScoreBreakdown(
            base=0, bonus_no_pause=1, bonus_few_pause=1,
            bonus_rest_saved=1, bonus_early=1,
            multiplier=body.multiplier, total=0,
        )

    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    planned_secs = body.task_hours * 3600
    effective_secs = (
        min(body.actual_seconds, planned_secs)
        if mode == "planned"
        else body.actual_seconds
    )
    effective_hours = effective_secs / 3600
    segments = max(1, _math.ceil(effective_hours / 0.5))
    base = body.task_stars * segments

    # 暂停阈值按任务原始段数算（不随提前完成缩水）
    plan_segments = max(1, _math.ceil(body.task_hours / 0.5))
    bn  = 1.3 if body.pause_count == 0 else 1.0
    bf  = 1.1 if (body.pause_count > 0 and body.pause_count <= max(1, plan_segments - 1)) else 1.0
    br  = 1.2 if body.rest_remaining_secs > 0 else 1.0
    be  = 1.1 if body.end_reason == "early" else 1.0
    mul = body.multiplier

    coef = bn * bf * br * be * mul
    total = round(base * coef)

    return ScoreBreakdown(
        base=base,
        bonus_no_pause=bn,
        bonus_few_pause=bf,
        bonus_rest_saved=br,
        bonus_early=be,
        multiplier=mul,
        total=total,
    )


class RunSaveResponse(BaseModel):
    score: int
    score_breakdown: ScoreBreakdown


@router.post("/run", response_model=RunSaveResponse, status_code=201)
def save_run_result(body: TaskRunResult):
    import os
    path = _os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    breakdown = _calc_score(body)
    record = body.model_dump()
    record["score"] = breakdown.total
    runs.append(record)
    _write(path, runs)
    tasks = load_daily_tasks(body.date)
    for t in tasks:
        if t["id"] == body.task_id:
            if body.success:
                t["done"] = True
                t["run_status"] = "completed"
            elif body.end_reason == "giveup":
                t["run_status"] = "paused"
            else:
                t["run_status"] = "running_failed"
    save_daily_tasks(body.date, tasks)
    return RunSaveResponse(score=breakdown.total, score_breakdown=breakdown)

class RunTimeUpdate(BaseModel):
    task_id: str
    date: str
    started_at: str   # ISO 格式，如 "2026-06-11T09:00:00"


@router.patch("/run/time")
def update_run_time(body: RunTimeUpdate):
    """修改 manual run 的开始时间（结束时间自动 = 开始时间 + actual_seconds）。"""
    from datetime import datetime as _Dt2, timedelta as _td2
    path = _os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    for r in runs:
        if r.get("task_id") == body.task_id and r.get("date") == body.date and r.get("source") == "manual":
            try:
                start = _Dt2.fromisoformat(body.started_at)
            except ValueError:
                raise HTTPException(400, "started_at 格式无效，请用 HH:MM 或完整 ISO 格式")
            secs = r.get("actual_seconds", 0)
            r["started_at"] = start.isoformat()
            r["ended_at"]   = (start + _td2(seconds=secs)).isoformat()
            _write(path, runs)
            return {"ok": True}
    raise HTTPException(404, "未找到对应的手动记录")


@router.get("/runs", response_model=list[TaskRunResult])
def get_runs(date: str | None = None):
    """返回指定日期（或全部）的执行记录，过滤无时间信息的旧格式。"""
    import os
    from storage.tasks import _read, DATA_DIR
    path = os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    if date:
        runs = [r for r in runs if r.get("date") == date]
    # 只返回有 started_at 的记录（旧格式无此字段，跳过）
    runs = [r for r in runs if r.get("started_at")]
    return runs


@router.get("/daily-score")
def get_daily_score(date: str | None = None):
    """返回指定日期（默认今日）的总得分，汇总所有完成任务的 score。"""
    import os
    from storage.tasks import _read, DATA_DIR
    target = date or _game_today()
    path = os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    total = sum(r.get("score", 0) for r in runs if r.get("date") == target and r.get("success"))
    return {"date": target, "total_score": total}


# ── 常规任务 ─────────────────────────────────────────────────

class RoutineTask(BaseModel):
    id: str
    content: str
    hours: float
    stars: int
    target_days: int
    created_date: str
    allow_makeup: bool
    streak: int
    best_streak: int
    total_done: int
    last_done_date: str | None
    force_warning: bool
    makeup_available: bool   # 今天可补昨天（派生字段，不存储）
    completed: bool

class RoutineCreate(BaseModel):
    content: str
    hours: float
    stars: int
    target_days: int
    allow_makeup: bool = False

class RoutineSettings(BaseModel):
    max_routines: int
    fail_days_limit: int


def _check_force_warning(routine: dict, fail_days_limit: int) -> bool:
    """判断是否触发强制删除警告：创建后连续 fail_days_limit 天未完成。"""
    if routine.get("completed"):
        return False
    today = Date.fromisoformat(_game_today())
    created = Date.fromisoformat(routine.get("created_date", str(today)))
    log = routine.get("log", {})
    consecutive_fails = 0
    for i in range(fail_days_limit):
        day = today - timedelta(days=i)
        # 创建日期之前的天数不计入失败
        if day < created:
            break
        day_str = str(day)
        if log.get(day_str) is True:
            # 当天已完成，连续中断
            break
        else:
            consecutive_fails += 1
    return consecutive_fails >= fail_days_limit


def _makeup_available(r: dict) -> bool:
    """今天可以补昨天：allow_makeup=True，昨天未完成，今天已完成，且创建日期 <= 昨天。"""
    if not r.get("allow_makeup") or r.get("completed"):
        return False
    today = Date.fromisoformat(_game_today())
    yesterday = str(today - timedelta(days=1))
    created = Date.fromisoformat(r.get("created_date", str(today)))
    if Date.fromisoformat(yesterday) < created:
        return False
    log = r.get("log", {})
    # 今天已完成、昨天未完成，才能补
    return log.get(str(today)) is True and log.get(yesterday) is not True


def _routine_to_model(r: dict, fail_days_limit: int) -> dict:
    r["force_warning"] = _check_force_warning(r, fail_days_limit)
    r.setdefault("allow_makeup", False)
    r["makeup_available"] = _makeup_available(r)
    return r


@router.get("/routines", response_model=dict)
def get_routines():
    """返回常规任务列表和设置。"""
    data = load_routines()
    fl = data["fail_days_limit"]
    data["routines"] = [_routine_to_model(r, fl) for r in data["routines"]]
    return data


@router.put("/routines/settings", response_model=RoutineSettings)
def update_routine_settings(body: RoutineSettings):
    data = load_routines()
    data["max_routines"] = max(1, min(10, body.max_routines))
    data["fail_days_limit"] = max(1, min(30, body.fail_days_limit))
    save_routines(data)
    return RoutineSettings(max_routines=data["max_routines"], fail_days_limit=data["fail_days_limit"])


@router.post("/routines", response_model=RoutineTask, status_code=201)
def create_routine(body: RoutineCreate):
    data = load_routines()
    active = [r for r in data["routines"] if not r.get("completed")]
    if len(active) >= data["max_routines"]:
        raise HTTPException(400, f"最多同时进行 {data['max_routines']} 个常规任务，请先删除或完成现有任务")
    routine = {
        "id": str(uuid.uuid4()),
        "content": body.content,
        "hours": body.hours,
        "stars": body.stars,
        "target_days": body.target_days,
        "created_date": _game_today(),
        "allow_makeup": body.allow_makeup,
        "streak": 0,
        "best_streak": 0,
        "total_done": 0,
        "last_done_date": None,
        "force_warning": False,
        "completed": False,
        "log": {},
    }
    data["routines"].append(routine)
    save_routines(data)
    return _routine_to_model(routine, data["fail_days_limit"])


@router.delete("/routines/{routine_id}", status_code=204)
def delete_routine(routine_id: str):
    data = load_routines()
    data["routines"] = [r for r in data["routines"] if r["id"] != routine_id]
    save_routines(data)


def _recalc_streak(r: dict) -> None:
    """从 log 从头重算 streak（保证补卡后数据一致）。"""
    log = r.get("log", {})
    done_dates = sorted(d for d, v in log.items() if v is True)
    if not done_dates:
        r["streak"] = 0
        r["last_done_date"] = None
        return
    streak = 1
    best = 1
    for i in range(1, len(done_dates)):
        prev = Date.fromisoformat(done_dates[i - 1])
        cur  = Date.fromisoformat(done_dates[i])
        if (cur - prev).days == 1:
            streak += 1
        else:
            streak = 1
        best = max(best, streak)
    r["streak"] = streak
    r["best_streak"] = max(r.get("best_streak", 0), best)
    r["last_done_date"] = done_dates[-1]


@router.patch("/routines/{routine_id}/done", response_model=RoutineTask)
def mark_routine_done(routine_id: str, date: str | None = None):
    """标记常规任务完成（切换）。date 默认今天，补卡时传昨天日期。"""
    target_date = date or _game_today()
    data = load_routines()
    fl = data["fail_days_limit"]
    for r in data["routines"]:
        if r["id"] != routine_id:
            continue
        log: dict = r.setdefault("log", {})
        current = log.get(target_date, False)
        new_val = not current
        log[target_date] = new_val

        # 重算 total_done 和 streak
        r["total_done"] = sum(1 for v in log.values() if v is True)
        _recalc_streak(r)
        r["completed"] = r["total_done"] >= r["target_days"]

        save_routines(data)
        return _routine_to_model(r, fl)
    raise HTTPException(404, "常规任务不存在")


# ── 有效学习时间统计 ─────────────────────────────────────────

import os as _os


def _get_runs_for_date(date: str) -> list[dict]:
    path = _os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    return [r for r in runs if r.get("date") == date and r.get("started_at")]


def _calc_effective_secs(runs: list[dict], mode: str) -> int:
    """实际口径：累加 actual_seconds；计划口径：每条取 min(actual, task_hours*3600)。"""
    total = 0
    for r in runs:
        actual = r.get("actual_seconds", 0)
        planned = int(r.get("task_hours", 1.0) * 3600)
        total += min(actual, planned) if mode == "planned" else actual
    return total


# ── 目标状态存储（goal_state.json）───────────────────────────
# {
#   "goal_secs": 3600,          # 当前目标（秒）
#   "step_mins": 10,            # 达标后每次增加的分钟数
#   "fail_limit": 3,            # 连续未达标几天触发降级
#   "degrade_mins": 10,         # 降级时减少的分钟数
#   "min_goal_mins": 15,        # 目标最低下限（分钟）
#   "consecutive_hits": 0,      # 当前连续达标天数
#   "consecutive_fails": 0,     # 当前连续未达标天数
#   "last_checked_date": ""     # 上次结算的日期（防重复结算）
# }

GOAL_STATE_FILE = _os.path.join(DATA_DIR, "goal_state.json")
GOAL_DEFAULTS = {
    "goal_secs": 3600,
    "step_mins": 10,
    "fail_limit": 3,
    "degrade_mins": 10,
    "min_goal_mins": 15,
    "consecutive_hits": 0,
    "consecutive_fails": 0,
    "last_checked_date": "",
}


def _load_goal_state() -> dict:
    if not _os.path.exists(GOAL_STATE_FILE):
        _write(GOAL_STATE_FILE, GOAL_DEFAULTS)
        return dict(GOAL_DEFAULTS)
    state = _read(GOAL_STATE_FILE, GOAL_DEFAULTS)
    for k, v in GOAL_DEFAULTS.items():
        state.setdefault(k, v)
    return state


def _save_goal_state(state: dict) -> None:
    _write(GOAL_STATE_FILE, state)


def _settle_yesterday(state: dict, mode: str) -> dict:
    """结算昨天的达成情况，更新目标和连续计数（每天只结算一次）。"""
    today = _game_today()
    yesterday = str(Date.fromisoformat(today) - timedelta(days=1))
    if state.get("last_checked_date") == today:
        return state  # 今天已结算过

    excluded = load_excluded_dates()
    if yesterday in excluded:
        # 排除天：不计入，不改变目标，只更新日期
        state["last_checked_date"] = today
        return state

    runs = _get_runs_for_date(yesterday)
    actual = _calc_effective_secs(runs, mode)
    goal = state["goal_secs"]

    if actual >= goal:
        # 达标：连续命中+1，重置失败计数，目标上升
        state["consecutive_hits"] += 1
        state["consecutive_fails"] = 0
        step = state["step_mins"] * 60
        state["goal_secs"] = goal + step
    else:
        # 未达标：连续失败+1，重置命中计数
        state["consecutive_hits"] = 0
        state["consecutive_fails"] += 1
        if state["consecutive_fails"] >= state["fail_limit"]:
            # 降级
            degrade = state["degrade_mins"] * 60
            min_goal = state["min_goal_mins"] * 60
            state["goal_secs"] = max(min_goal, goal - degrade)
            state["consecutive_fails"] = 0  # 降级后重置，避免持续降

    state["last_checked_date"] = today
    return state


class DailyStats(BaseModel):
    date: str
    effective_secs_actual: int
    effective_secs_planned: int
    excluded: bool
    exclude_reason: str
    mode: str


class GoalResult(BaseModel):
    goal_secs: int               # 今日目标（秒）
    consecutive_hits: int        # 连续达标天数
    consecutive_fails: int       # 当前连续未达标天数（未触发降级前）
    fail_limit: int              # 触发降级的阈值
    step_mins: int               # 达标后增加的分钟数
    degrade_mins: int            # 降级时减少的分钟数
    mode: str


def _make_daily_stats(date: str, excluded_map: dict[str, str], mode: str) -> DailyStats:
    runs = _get_runs_for_date(date)
    return DailyStats(
        date=date,
        effective_secs_actual=_calc_effective_secs(runs, "actual"),
        effective_secs_planned=_calc_effective_secs(runs, "planned"),
        excluded=date in excluded_map,
        exclude_reason=excluded_map.get(date, ""),
        mode=mode,
    )


@router.get("/daily-stats", response_model=DailyStats)
def get_daily_stats(date: str | None = None):
    today = date or _game_today()
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    excluded = load_excluded_dates()
    return _make_daily_stats(today, excluded, mode)


class ExcludeBody(BaseModel):
    reason: str = ""


@router.post("/daily-stats/exclude", response_model=DailyStats)
def set_exclude(date: str | None = None, body: ExcludeBody = ExcludeBody()):
    """标记某天排除（附理由）或取消排除（reason 为 '__cancel__'）。"""
    today = date or _game_today()
    excluded = load_excluded_dates()
    if body.reason == "__cancel__":
        excluded.pop(today, None)
    else:
        excluded[today] = body.reason
    save_excluded_dates(excluded)
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    return _make_daily_stats(today, excluded, mode)


@router.get("/goal", response_model=GoalResult)
def get_daily_goal():
    """获取今日目标（自动结算昨天达成情况）。"""
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    state = _load_goal_state()
    state = _settle_yesterday(state, mode)
    _save_goal_state(state)
    return GoalResult(
        goal_secs=state["goal_secs"],
        consecutive_hits=state["consecutive_hits"],
        consecutive_fails=state["consecutive_fails"],
        fail_limit=state["fail_limit"],
        step_mins=state["step_mins"],
        degrade_mins=state["degrade_mins"],
        mode=mode,
    )


class GoalSettings(BaseModel):
    step_mins: int      # 达标后每次增加分钟数
    fail_limit: int     # 连续未达标几天降级
    degrade_mins: int   # 降级减少分钟数
    min_goal_mins: int  # 最低目标分钟数
    goal_mins: int      # 重置/修改当前目标（分钟）


@router.put("/goal/settings", response_model=GoalResult)
def update_goal_settings(body: GoalSettings):
    """更新爬坡参数，可同时修改当前目标。"""
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    state = _load_goal_state()
    state["step_mins"]     = max(1, body.step_mins)
    state["fail_limit"]    = max(1, min(14, body.fail_limit))
    state["degrade_mins"]  = max(1, body.degrade_mins)
    state["min_goal_mins"] = max(5, body.min_goal_mins)
    state["goal_secs"]     = max(state["min_goal_mins"] * 60, body.goal_mins * 60)
    _save_goal_state(state)
    return GoalResult(
        goal_secs=state["goal_secs"],
        consecutive_hits=state["consecutive_hits"],
        consecutive_fails=state["consecutive_fails"],
        fail_limit=state["fail_limit"],
        step_mins=state["step_mins"],
        degrade_mins=state["degrade_mins"],
        mode=mode,
    )

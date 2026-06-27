import uuid
import random
from datetime import date as Date, datetime as _Datetime, timedelta
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


def _game_today() -> str:
    """游戏日以零点为起点，与自然日对齐。"""
    return str(_Datetime.now().date())

from storage.tasks import (
    load_templates, save_templates,
    load_daily_tasks, save_daily_tasks,
    load_bounty_pool, save_bounty_pool,
    load_daily_bounties, save_daily_bounties,
    load_routines, save_routines,
    load_excluded_dates, save_excluded_dates,
    _read, _write, DATA_DIR, DAILY_TASKS_FILE,
)
from storage.config import load_config
from storage.buff_rewards import (
    create_buff_reward,
    mark_buff_reward_revealed,
    pending_buff_rewards,
)
from storage.buff_effects import (
    apply_active_daily_score_rewards,
    apply_reward_effect,
)
from routers.ai import emit_task_event

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
    count_in_effective: bool = True   # 是否计入有效学习时间
    keep: bool = False   # 保留任务：未必今天完成，跨天保留，任意时候可执行

class DailyTaskCreate(BaseModel):
    content: str
    hours: float
    stars: int
    count_in_effective: bool = True
    keep: bool = False

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

def _migrate_kept_tasks(today: str) -> list[dict]:
    """把过往日期里未完成的「保留任务」迁移到今天。

    保留任务（keep=True）跨天保留：扫描所有早于今天的日期，把其中未完成的
    保留任务从原日期移除、合并进今天的列表（保持原 id / 进度 / 状态）。
    迁移后从原日期删除，避免在历史里残留为「未完成」。
    """
    all_days: dict = _read(DAILY_TASKS_FILE, {})
    today_tasks = list(all_days.get(today, []))
    today_ids = {t["id"] for t in today_tasks}
    moved: list[dict] = []
    changed = False
    for day in sorted(all_days.keys()):
        if day >= today:
            continue
        remaining = []
        for t in all_days[day]:
            done = t.get("done") or t.get("run_status") == "completed"
            if t.get("keep") and not done:
                # 迁移到今天（去重，避免重复）
                if t["id"] not in today_ids:
                    moved.append(t)
                    today_ids.add(t["id"])
                changed = True
            else:
                remaining.append(t)
        if len(remaining) != len(all_days[day]):
            all_days[day] = remaining
    if moved:
        all_days[today] = today_tasks + moved
        changed = True
    if changed:
        _write(DAILY_TASKS_FILE, all_days)
    return all_days.get(today, today_tasks)


@router.post("/daily/init", response_model=list[DailyTask])
def init_daily_tasks(date: str | None = None):
    """用模板初始化当日任务（每天第一次打开时调用）。"""
    today = date or _game_today()
    # 先把过往未完成的保留任务迁移到今天（即使今天已有任务也要迁）
    _migrate_kept_tasks(today)
    existing = load_daily_tasks(today)
    if existing:
        return existing  # 已初始化（或已有迁移来的保留任务），不再套模板
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
            "count_in_effective": t.get("count_in_effective", True),
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

    # 搭子反馈：新增任务必反馈（仅今天）。统一走 emit_task_event。
    if today == _game_today():
        emit_task_event("created", "kept" if task.get("keep") else "daily",
                        content=task.get("content", ""),
                        hours=task.get("hours", 0))

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
            # 先移除旧 manual 记录（防重复）
            runs = [r for r in runs if not (r.get("task_id") == task_id and r.get("source") == "manual")]
            tasks[i]["run_status"] = "completed"
            now = _Dt.now()
            secs = int(t.get("hours", 1.0) * 3600)
            started = (now - timedelta(seconds=secs)).isoformat()
            ended   = now.isoformat()
            count_eff = t.get("count_in_effective", True)
            cfg = load_config()
            mode = cfg.get("effective_time_mode", "actual")
            task_hours = t.get("hours", 1.0)
            task_stars = t.get("stars", 3)
            planned_secs = task_hours * 3600
            effective_secs = min(secs, planned_secs) if mode == "planned" else secs
            import math as _m
            segments = max(1, _m.ceil(effective_secs / 3600 / 0.5))
            saved_bonus = cfg.get("daily_bonus")
            multiplier = 1.0
            if saved_bonus and saved_bonus.get("date") == today:
                multiplier = saved_bonus.get("multiplier", 1.0)
            # 不计入有效时间的任务得分为 0
            manual_score = round(task_stars * segments * multiplier) if count_eff else 0
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
                "count_in_effective": count_eff,
            })
        else:
            # 取消勾选：删掉对应的 manual run，恢复状态
            runs = [r for r in runs if not (r.get("task_id") == task_id and r.get("source") == "manual")]
            tasks[i]["run_status"] = "none"

        _write(runs_path, runs)
        save_daily_tasks(today, tasks)

        # 搭子反馈：直接勾选完成也触发，仅今天、勾上才发（取消完成不接）。
        # 完成必反馈（emit_task_event 内 force）。
        if new_done and today == _game_today():
            _maybe_create_task_buff_reward(
                today,
                tasks[i]["id"],
                tasks[i].get("content", ""),
                "kept" if tasks[i].get("keep") else "daily",
            )
            apply_active_daily_score_rewards(today)
            emit_task_event("completed", "kept" if tasks[i].get("keep") else "daily",
                            content=tasks[i].get("content", ""),
                            early=False,
                            minutes=round(tasks[i].get("hours", 1.0) * 60),
                            score=manual_score)

        return tasks[i]
    raise HTTPException(404, "任务不存在")

@router.delete("/daily/{task_id}", status_code=204)
def delete_daily_task(task_id: str, date: str | None = None):
    today = date or _game_today()
    tasks = load_daily_tasks(today)
    removed = next((t for t in tasks if t["id"] == task_id), None)
    save_daily_tasks(today, [t for t in tasks if t["id"] != task_id])

    # 删任务时一并清掉它的执行记录，避免被删的任务还残留在时间轴/有效时间统计里
    import os as _os_del
    runs_path = _os_del.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(runs_path, [])
    filtered = [r for r in runs if r.get("task_id") != task_id]
    if len(filtered) != len(runs):
        _write(runs_path, filtered)

    # 搭子反馈：删任务（仅今天）。低概率 + 冷却，避免连删/改错重加刷屏。
    if removed is not None and today == _game_today():
        emit_task_event("deleted", "kept" if removed.get("keep") else "daily",
                        content=removed.get("content", ""))

# ── 赏金任务（新系统）────────────────────────────────────────
# 内容从历史 task_runs 去重抽取，buff 系统随机分配
# 每天生成 0-2 个赏金任务，每个分配随机弹出时间窗口（游戏日内）
# 前端轮询 /bounty/daily/pending，有到期未弹的就弹出

from storage.buffs import BUFF_TEMPLATES, random_buff
from datetime import datetime as Datetime, time as Time
import ai_client

TASK_BUFF_CHANCE = 0.2


def _maybe_roll_task_buff() -> dict | None:
    if random.random() >= TASK_BUFF_CHANCE:
        return None
    return random_buff()


def _create_and_apply_buff_reward(
    date: str,
    task_id: str,
    task_content: str,
    task_type: str,
    buff: dict,
) -> dict:
    normalized_type = task_type if task_type in ("daily", "kept", "routine", "bounty") else "daily"
    reward = create_buff_reward(
        date=date,
        task_id=task_id,
        task_content=task_content,
        task_type=normalized_type,
        buff=buff,
    )
    return apply_reward_effect(reward)


def _maybe_create_task_buff_reward(date: str, task_id: str, task_content: str, task_type: str) -> dict | None:
    if task_type == "bounty":
        return None
    buff = _maybe_roll_task_buff()
    if not buff:
        return None
    return _create_and_apply_buff_reward(
        date=date,
        task_id=task_id,
        task_content=task_content,
        task_type=task_type,
        buff=buff,
    )


def _create_bounty_buff_reward(date: str, bounty_id: str) -> dict | None:
    data = load_daily_bounties(date)
    bounty = next((b for b in data.get("bounties", []) if b.get("id") == bounty_id), None)
    if not bounty or not bounty.get("buff"):
        return None
    return _create_and_apply_buff_reward(
        date=date,
        task_id=bounty_id,
        task_content=bounty.get("content", ""),
        task_type="bounty",
        buff=bounty["buff"],
    )


def _all_task_contents() -> list[dict]:
    """从所有历史执行记录中提取去重的任务内容（仅 content/hours/stars，供降级模式用）。"""
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


def _task_profiles() -> list[dict]:
    """带画像的历史任务：每个任务做过几次、最近一次什么时候、成功率。

    给 AI 派赏金任务用——它能据此判断哪些是你常做的、哪些荒废了、
    哪些一直没做好，从而派得更懂你，而不是从一堆任务名里机械挑。
    按最近执行时间倒序。
    """
    import os as _os4
    path = _os4.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    prof: dict[str, dict] = {}
    for r in runs:
        c = r.get("task_content", "").strip()
        if not c:
            continue
        p = prof.setdefault(c, {
            "content": c,
            "hours": r.get("task_hours", 1.0),
            "stars": r.get("task_stars", 3),
            "times": 0,          # 做过几次
            "success": 0,        # 成功几次
            "last_date": "",     # 最近一次执行日期
        })
        p["times"] += 1
        if r.get("success"):
            p["success"] += 1
        d = r.get("date", "")
        if d > p["last_date"]:
            p["last_date"] = d
        # hours/stars 以最近一次为准
        if d >= p["last_date"]:
            p["hours"] = r.get("task_hours", p["hours"])
            p["stars"] = r.get("task_stars", p["stars"])
    items = list(prof.values())
    items.sort(key=lambda x: x["last_date"], reverse=True)
    return items


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
    让 AI 像懂你的搭子一样，结合你的完整成长画像，为今天派 0-2 个赏金任务。

    喂给 AI 的不只是任务名，而是：
      - 你的整体画像（赢麻了 / 专注时长 / 习惯，来自 supervisor_context）
      - 每个历史任务做过几次、最近一次什么时候、成功率
    让它据此挑出/设计对你此刻真正有意义的任务，并给一句「为什么给你派这个」。

    返回 list[{content, hours, stars, reason}]（0-2 条），失败返回 None（调用方降级）。
    """
    # 完整画像（搭子也在用的聚合）——让 AI 真正了解这个人
    try:
        from supervisor_context import build_summary
        profile = build_summary()
    except Exception:
        profile = ""

    # 带频次/时间的任务画像
    profiles = _task_profiles()

    def _ago(last: str) -> str:
        if not last:
            return "很久没做"
        try:
            gap = (Date.fromisoformat(today) - Date.fromisoformat(last)).days
        except Exception:
            return ""
        if gap <= 0:
            return "今天做过"
        if gap == 1:
            return "昨天做过"
        if gap <= 7:
            return f"{gap}天前做过"
        if gap <= 30:
            return f"约{gap // 7}周前"
        return "一个多月没做了"

    task_lines = "\n".join(
        f"- {p['content']}（通常{p['hours']}h、{p['stars']}星；"
        f"做过{p['times']}次、成功{p['success']}次、{_ago(p['last_date'])}）"
        for p in profiles
    )

    prompt = f"""今天是 {today}。你是一个游戏化成长 App 里住着的小伙伴——用户的老朋友、搭子，很懂他这个人。
现在轮到你给他派 0-2 个今天的「赏金任务」（一种带奖励的特别任务，他可以接受或拒绝）。

【你对他的了解】
{profile or "（暂时还不太了解他，凭下面的任务记录发挥。）"}

【他做过的任务和频率】
{task_lines or "（还没有任务记录。）"}

像一个真正为他着想的朋友那样思考，而不是机械地从列表里挑：
- 挑出/设计此刻对他真正有意义的事——可以是他坚持得好、值得再推一把的；也可以是荒废了一阵、温柔提醒他捡起来的；还可以结合他最近的状态创新一个新任务。
- 不要派一次性的、和特定项目/日期绑死的任务。
- 时长 0.5~4h、重要度 1~5 星，合理即可。
- 如果今天实在没有合适的，就派 0 个（返回空数组）。宁缺毋滥，别硬凑套路任务。

每个任务给一句**温暖、具体、像朋友说话**的派发理由（reason，≤30字，说清你为什么给他派这个，不要喊口号/说教）。

以 JSON 数组返回，每个元素含 content（字符串）、hours（数字）、stars（整数1-5）、reason（字符串）：
[{{"content": "...", "hours": 1.0, "stars": 3, "reason": "..."}}]

返回 0 个就给空数组 []。只返回 JSON，不要其他说明。"""

    result = ai_client.chat_json(prompt)
    if not isinstance(result, list):
        return None
    # 校验并清洗每条；最多保留 2 条**有效**任务（跳过的脏数据不占名额）
    cleaned = []
    for item in result:
        if len(cleaned) >= 2:
            break
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        try:
            hours = float(item.get("hours", 1.0))
        except (TypeError, ValueError):
            hours = 1.0
        hours = max(0.25, min(8.0, hours))
        try:
            stars = int(item.get("stars", 3))
        except (TypeError, ValueError):
            stars = 3
        stars = max(1, min(5, stars))
        reason = str(item.get("reason", "")).strip()[:40]
        cleaned.append({"content": content, "hours": hours, "stars": stars, "reason": reason})
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
    reason: str = ""     # AI 派发这条任务的理由（搭子口吻，人性化展示）


class BuffReward(BaseModel):
    id: str
    date: str
    task_id: str
    task_content: str
    task_type: str
    buff: BountyBuff
    revealed: bool = False
    created_at: str = ""
    revealed_at: str = ""


@router.get("/buff-rewards/pending", response_model=list[BuffReward])
def get_pending_buff_rewards(date: str | None = None):
    today = date or _game_today()
    return pending_buff_rewards(today)


@router.patch("/buff-rewards/{reward_id}/revealed", response_model=BuffReward)
def reveal_buff_reward(reward_id: str):
    reward = mark_buff_reward_revealed(reward_id)
    if reward is None:
        raise HTTPException(404, "Buff 奖励不存在")
    return reward


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
            "reason": item.get("reason", ""),
        })

    save_daily_bounties(today, {"generated": True, "bounties": bounties})
    return bounties


def append_bounty_task(content: str, hours: float, stars: int, reason: str = "",
                       date: str | None = None) -> dict:
    """追加一个赏金任务到当日列表，立即可见（popup_at=现在）。

    供「用户在聊天框主动要任务」复用：和随机赏金完全一样（带 buff、走
    accepted→done 流程），区别只是触发方式是用户开口要、且立刻弹出。
    返回新建的赏金 dict。
    """
    today = date or _game_today()
    content = content.strip()[:100]
    if not content:
        raise ValueError("任务内容不能为空")
    hours = max(0.25, min(8.0, float(hours)))
    stars = max(1, min(5, int(stars)))

    data = load_daily_bounties(today)
    bounties = data.get("bounties", [])
    bounty = {
        "id": str(uuid.uuid4()),
        "content": content,
        "hours": hours,
        "stars": stars,
        "buff": random_buff(),
        "status": "pending",
        "popup_at": Datetime.now().isoformat(),  # 立即可见
        "ai_generated": True,
        "reason": reason.strip()[:40],
    }
    bounties.append(bounty)
    # 保持 generated 标记不变（若今天还没生成过，这里也不触发随机生成）
    data["bounties"] = bounties
    data.setdefault("generated", True)
    save_daily_bounties(today, data)
    return bounty


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
    # 读取任务的 count_in_effective 并写入执行记录
    tasks = load_daily_tasks(body.date)
    count_in_effective = True
    for t in tasks:
        if t["id"] == body.task_id:
            count_in_effective = t.get("count_in_effective", True)
            if body.success:
                t["done"] = True
                t["run_status"] = "completed"
            elif body.end_reason == "giveup":
                t["run_status"] = "paused"
            else:
                t["run_status"] = "running_failed"
    record["count_in_effective"] = count_in_effective
    runs.append(record)
    _write(path, runs)
    save_daily_tasks(body.date, tasks)
    actual_score = breakdown.total

    # 搭子反馈：完成（必反馈）/ 中断·力竭（按概率+冷却，不频繁）。
    # 任务类型由 source 推断：bounty=赏金，否则看任务自身 keep（保留/日常）。
    if body.date == _game_today():
        if body.source == "bounty":
            ttype = "bounty"
        else:
            kept = any(t["id"] == body.task_id and t.get("keep") for t in tasks)
            ttype = "kept" if kept else "daily"
        if body.success:
            if ttype == "bounty":
                _create_bounty_buff_reward(body.date, body.task_id)
            else:
                _maybe_create_task_buff_reward(body.date, body.task_id, body.task_content, ttype)
            apply_active_daily_score_rewards(body.date)
            saved_runs: list = _read(path, [])
            saved = next((
                r for r in reversed(saved_runs)
                if r.get("task_id") == body.task_id
                and r.get("date") == body.date
                and r.get("started_at") == body.started_at
            ), record)
            actual_score = int(saved.get("score", breakdown.total) or 0)
            emit_task_event("completed", ttype,
                            content=body.task_content,
                            early=body.end_reason == "early",
                            minutes=round(body.actual_seconds / 60),
                            score=actual_score)
        elif body.end_reason in ("giveup", "failed"):
            pct = min(99, round(body.actual_seconds / max(body.task_hours * 3600, 1) * 100))
            emit_task_event("interrupted" if body.end_reason == "giveup" else "failed",
                            ttype,
                            content=body.task_content,
                            percent=pct)

    return RunSaveResponse(score=actual_score, score_breakdown=breakdown)

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
    streak: int
    best_streak: int
    total_done: int
    last_done_date: str | None
    force_warning: bool
    fail_days: int            # 当前连续未完成天数（派生字段）
    completed: bool

class ArchivedRoutine(BaseModel):
    id: str
    content: str
    hours: float
    stars: int
    target_days: int
    created_date: str
    archived_date: str
    archive_reason: str       # "completed" | "failed"
    total_done: int
    best_streak: int

class RoutineCreate(BaseModel):
    content: str
    hours: float
    stars: int
    target_days: int

class RoutineSettings(BaseModel):
    max_routines: int          # 只读，由系统自动管理
    fail_days_limit: int


def _count_fail_days(routine: dict, max_days: int = 365) -> int:
    """计算从昨天往前连续未完成的天数（今天未结束不计入；创建日之前不计入）。

    规则：
    - 完成日（log 为 True）→ 终止连续失败统计
    - 请假日（excused 中有记录）→ 跳过，不计入失败、也不终止
    - 其余（明确中断 log=False，或没打卡也没请假）→ 都计入连续失败
      （没点就是没坚持。「放假/没开 app」那种由学习时长弹窗整段裁定为请假来桥接）
    """
    if routine.get("completed"):
        return 0
    today = Date.fromisoformat(_game_today())
    created = Date.fromisoformat(routine.get("created_date", str(today)))
    log = routine.get("log", {})
    excused = routine.get("excused", {})
    consecutive_fails = 0
    for i in range(1, max_days + 1):
        day = today - timedelta(days=i)
        if day < created:
            break
        ds = str(day)
        if log.get(ds) is True:
            break
        if ds in excused:
            continue          # 请假日：桥接，不计失败
        consecutive_fails += 1  # 中断 或 没打卡 → 都计入连续失败
    return consecutive_fails


def _routine_to_model(r: dict, fail_days_limit: int) -> dict:
    fail_days = _count_fail_days(r)
    r["fail_days"] = fail_days
    r["force_warning"] = fail_days >= fail_days_limit
    return r


def _archive_routine(r: dict, reason: str, data: dict) -> None:
    """将常规任务移入 archived_routines，并自动调整 max_routines。
    完成 → 上限 +1；失败 → 上限 -1（最低 3）。
    """
    archived = {
        "id": r["id"],
        "content": r.get("content", ""),
        "hours": r.get("hours", 1.0),
        "stars": r.get("stars", 3),
        "target_days": r.get("target_days", 21),
        "created_date": r.get("created_date", _game_today()),
        "archived_date": _game_today(),
        "archive_reason": reason,
        "total_done": r.get("total_done", 0),
        "best_streak": r.get("best_streak", 0),
    }
    data.setdefault("archived_routines", []).append(archived)
    data["routines"] = [x for x in data["routines"] if x["id"] != r["id"]]
    current = data.get("max_routines", 3)
    if reason == "completed":
        data["max_routines"] = current + 1
    elif reason == "failed":
        data["max_routines"] = max(3, current - 1)


@router.get("/routines", response_model=dict)
def get_routines():
    """返回常规任务列表和设置。自动归档超过 fail_days_limit 连续失败的任务。"""
    data = load_routines()
    fl = data["fail_days_limit"]
    changed = False
    for r in list(data["routines"]):
        fail_days = _count_fail_days(r)
        if not r.get("completed") and fail_days >= fl:
            _archive_routine(r, "failed", data)
            changed = True
    if changed:
        save_routines(data)
    data["routines"] = [_routine_to_model(r, fl) for r in data["routines"]]
    return data


@router.get("/routines/archived", response_model=list[ArchivedRoutine])
def get_archived_routines():
    """返回所有已归档（完成/失败）的常规任务历史。"""
    data = load_routines()
    return data.get("archived_routines", [])


@router.post("/routines/{routine_id}/restart", response_model=RoutineTask)
def restart_routine(routine_id: str):
    """将归档中的失败常规任务重新启动（受 max_routines 限制）。"""
    data = load_routines()
    archived = data.get("archived_routines", [])
    target = next((a for a in archived if a["id"] == routine_id), None)
    if not target:
        raise HTTPException(404, "归档任务不存在")
    if target.get("archive_reason") != "failed":
        raise HTTPException(400, "已完成的任务无法重启")
    active_count = len(data["routines"])
    if active_count >= data["max_routines"]:
        raise HTTPException(400, f"当前常规任务已达上限 {data['max_routines']} 个，请先删除一个再重启")
    new_routine = {
        "id": str(uuid.uuid4()),
        "content": target["content"],
        "hours": target["hours"],
        "stars": target["stars"],
        "target_days": target["target_days"],
        "created_date": _game_today(),
        "streak": 0,
        "best_streak": 0,
        "total_done": 0,
        "last_done_date": None,
        "completed": False,
        "log": {},
    }
    data["routines"].append(new_routine)
    # 移除归档中的对应记录
    data["archived_routines"] = [a for a in archived if a["id"] != routine_id]
    save_routines(data)
    return _routine_to_model(new_routine, data["fail_days_limit"])


class RoutineSettingsUpdate(BaseModel):
    fail_days_limit: int

@router.put("/routines/settings", response_model=RoutineSettings)
def update_routine_settings(body: RoutineSettingsUpdate):
    data = load_routines()
    # max_routines 由系统自动管理，不接受用户修改
    data["fail_days_limit"] = max(1, min(30, body.fail_days_limit))
    save_routines(data)
    return RoutineSettings(max_routines=data["max_routines"], fail_days_limit=data["fail_days_limit"])


# ── 漏打结算 ─────────────────────────────────────────────────
# 用户可能连续几天没打开 app（放假等）。这些天既没打卡也没标请假，
# 属于「未结算」状态。下次打开时逐个任务、逐天提示用户结算：
#   - excused：正当请假，桥接 streak，不计入连续失败
#   - missed ：确认中断，log[day]=False，计入连续失败

class PendingRoutineDay(BaseModel):
    routine_id: str
    content: str
    days: list[str]            # 待结算的日期（升序）

class RoutineSettleItem(BaseModel):
    day: str
    decision: str              # "excused" | "missed"
    reason: str = ""


def _pending_days(r: dict) -> list[str]:
    """返回该常规任务从创建日到昨天、既未打卡也未请假的待结算日期。"""
    if r.get("completed"):
        return []
    today = Date.fromisoformat(_game_today())
    created = Date.fromisoformat(r.get("created_date", str(today)))
    log = r.get("log", {})
    excused = r.get("excused", {})
    pending: list[str] = []
    d = created
    while d < today:
        ds = str(d)
        if ds not in log and ds not in excused:
            pending.append(ds)
        d += timedelta(days=1)
    return pending


@router.get("/routines/pending-settlement", response_model=list[PendingRoutineDay])
def get_pending_settlement():
    """返回所有需要逐天结算的常规任务及其待结算日期（供下次打开时弹窗）。"""
    data = load_routines()
    result: list[PendingRoutineDay] = []
    for r in data["routines"]:
        days = _pending_days(r)
        if days:
            result.append(PendingRoutineDay(
                routine_id=r["id"], content=r.get("content", ""), days=days,
            ))
    return result


def _settle_routines_for_range(start: str, end: str, decision: str, reason: str) -> None:
    """
    对 [start, end] 区间内、每个常规任务**未结算**的日子统一处理，跟学习时长裁定走同一决定：
      - skip  → excused（请假，桥接连续，不计入失败）
      - count → missed（中断，log=False，计入连续失败，可能触发归档）

    只动「既没打卡也没请假」的未结算日；已打卡/已请假的不覆盖。无需逐天确认——
    用户在学习时长弹窗里选的整段决定，常规任务一并套用。
    """
    data = load_routines()
    fl = data["fail_days_limit"]
    s = Date.fromisoformat(start)
    e = Date.fromisoformat(end)
    changed = False
    for r in data["routines"]:
        if r.get("completed"):
            continue
        log: dict = r.setdefault("log", {})
        excused: dict = r.setdefault("excused", {})
        created = Date.fromisoformat(r.get("created_date", start))
        d = s
        while d <= e:
            ds = str(d)
            # 创建日之前、或已结算（打卡/请假）的日子不动
            if d >= created and ds not in log and ds not in excused:
                if decision == "skip":
                    excused[ds] = reason or ""
                else:  # count
                    log[ds] = False
                changed = True
            d += timedelta(days=1)
        _recalc_streak(r)

    if not changed:
        return

    # 算中断可能让某些任务连续失败超限 → 归档
    for r in list(data["routines"]):
        if not r.get("completed") and _count_fail_days(r) >= fl:
            save_routines(data)
            _archive_routine(r, "failed", data)
    save_routines(data)


@router.post("/routines/{routine_id}/settle", response_model=RoutineTask)
def settle_routine(routine_id: str, items: list[RoutineSettleItem]):
    """对某常规任务的若干历史日期进行结算（请假 / 中断）。"""
    data = load_routines()
    fl = data["fail_days_limit"]
    for r in data["routines"]:
        if r["id"] != routine_id:
            continue
        log: dict = r.setdefault("log", {})
        excused: dict = r.setdefault("excused", {})
        for it in items:
            if it.decision == "excused":
                excused[it.day] = it.reason or ""
                log.pop(it.day, None)          # 防止冲突
            elif it.decision == "missed":
                log[it.day] = False
                excused.pop(it.day, None)
        _recalc_streak(r)
        # 结算后可能触发归档（连续中断超限）
        if not r.get("completed") and _count_fail_days(r) >= fl:
            save_routines(data)
            _archive_routine(r, "failed", data)
            save_routines(data)
            r["fail_days"] = _count_fail_days(r)
            r["force_warning"] = True
            return r
        save_routines(data)
        return _routine_to_model(r, fl)
    raise HTTPException(404, "常规任务不存在")


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

    # 搭子反馈：新增常规习惯必反馈
    emit_task_event("created", "routine",
                    content=routine.get("content", ""),
                    hours=routine.get("hours", 0))

    return _routine_to_model(routine, data["fail_days_limit"])


@router.delete("/routines/{routine_id}", status_code=204)
def delete_routine(routine_id: str):
    data = load_routines()
    removed = next((r for r in data["routines"] if r["id"] == routine_id), None)
    data["routines"] = [r for r in data["routines"] if r["id"] != routine_id]
    save_routines(data)

    # 搭子反馈：删常规习惯（低概率 + 冷却）
    if removed is not None:
        emit_task_event("deleted", "routine", content=removed.get("content", ""))


def _recalc_streak(r: dict) -> None:
    """从 log 从头重算 streak（保证补卡后数据一致）。

    请假日（excused）视为桥接：两次打卡之间若全是请假日，则连续不断。
    """
    log = r.get("log", {})
    excused = r.get("excused", {})
    done_dates = sorted(d for d, v in log.items() if v is True)
    if not done_dates:
        r["streak"] = 0
        r["last_done_date"] = None
        return

    def _bridged(prev: Date, cur: Date) -> bool:
        """prev 与 cur 之间（不含两端）是否全是请假日。"""
        d = prev + timedelta(days=1)
        while d < cur:
            if str(d) not in excused:
                return False
            d += timedelta(days=1)
        return True

    streak = 1
    best = 1
    for i in range(1, len(done_dates)):
        prev = Date.fromisoformat(done_dates[i - 1])
        cur  = Date.fromisoformat(done_dates[i])
        if (cur - prev).days == 1 or _bridged(prev, cur):
            streak += 1
        else:
            streak = 1
        best = max(best, streak)
    r["streak"] = streak
    r["best_streak"] = max(r.get("best_streak", 0), best)
    r["last_done_date"] = done_dates[-1]


@router.patch("/routines/{routine_id}/done", response_model=RoutineTask)
def mark_routine_done(routine_id: str, date: str | None = None):
    """标记常规任务完成（切换）。date 默认今天。"""
    import os as _os_r
    import math as _m_r
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

        # 非今日日期（如结算流程）只更新 streak，不写 task_run
        today = _game_today()
        if target_date == today:
            # 今日打卡：同步写/删 task_runs，计入今日有效学习时间
            runs_path = _os_r.path.join(DATA_DIR, "task_runs.json")
            runs: list = _read(runs_path, [])
            runs = [x for x in runs if not (x.get("task_id") == routine_id and x.get("source") == "routine" and x.get("date") == today)]
            if new_val:
                cfg = load_config()
                mode = cfg.get("effective_time_mode", "actual")
                task_hours = r.get("hours", 1.0)
                task_stars = r.get("stars", 3)
                secs = int(task_hours * 3600)
                # 时长为 0 的习惯不写执行记录，不显示在时间轴
                if secs == 0:
                    _write(runs_path, runs)
                    _maybe_create_task_buff_reward(
                        today,
                        routine_id,
                        r.get("content", ""),
                        "routine",
                    )
                    emit_task_event("completed", "routine",
                                    content=r.get("content", ""),
                                    streak=r.get("streak", 0))
                    if r["completed"]:
                        _archive_routine(r, "completed", data)
                        save_routines(data)
                        r["fail_days"] = 0
                        r["force_warning"] = False
                        return r
                    return _routine_to_model(r, fl)
                now = _Datetime.now()
                started = (now - timedelta(seconds=secs)).isoformat()
                ended = now.isoformat()
                saved_bonus = cfg.get("daily_bonus")
                multiplier = 1.0
                if saved_bonus and saved_bonus.get("date") == today:
                    multiplier = saved_bonus.get("multiplier", 1.0)
                effective_secs = min(secs, int(task_hours * 3600)) if mode == "planned" else secs
                segments = max(1, _m_r.ceil(effective_secs / 3600 / 0.5))
                routine_score = round(task_stars * segments * multiplier)
                runs.append({
                    "task_id": routine_id,
                    "task_content": r.get("content", ""),
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
                    "source": "routine",
                    "score": routine_score,
                })
            _write(runs_path, runs)
            if new_val:
                _maybe_create_task_buff_reward(
                    today,
                    routine_id,
                    r.get("content", ""),
                    "routine",
                )
                apply_active_daily_score_rewards(today)
                emit_task_event("completed", "routine",
                                content=r.get("content", ""),
                                streak=r.get("streak", 0))

        # 达成目标后自动归档为 completed
        if r["completed"] and new_val:
            _archive_routine(r, "completed", data)
            save_routines(data)
            # 返回归档前的最终状态给前端展示
            r["fail_days"] = 0
            r["force_warning"] = False
            return r

        return _routine_to_model(r, fl)
    raise HTTPException(404, "常规任务不存在")


# ── 有效学习时间统计 ─────────────────────────────────────────

import os as _os


def _get_runs_for_date(date: str) -> list[dict]:
    path = _os.path.join(DATA_DIR, "task_runs.json")
    runs: list = _read(path, [])
    return [r for r in runs if r.get("date") == date and r.get("started_at")]


def _calc_effective_secs(runs: list[dict], mode: str) -> int:
    """实际口径：累加 actual_seconds；计划口径：每条取 min(actual, task_hours*3600)。
    count_in_effective=False 的记录不计入。"""
    total = 0
    for r in runs:
        if not r.get("count_in_effective", True):
            continue
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


def _settle_hit(state: dict) -> None:
    """结算一个达标日：连续达标 +1，目标上升。"""
    state["consecutive_hits"] += 1
    state["consecutive_fails"] = 0
    state["goal_secs"] = state["goal_secs"] + state["step_mins"] * 60


def _settle_fail(state: dict) -> None:
    """结算一个未达标日：连续失败 +1，到阈值则降级。"""
    state["consecutive_hits"] = 0
    state["consecutive_fails"] += 1
    if state["consecutive_fails"] >= state["fail_limit"]:
        degrade = state["degrade_mins"] * 60
        min_goal = state["min_goal_mins"] * 60
        state["goal_secs"] = max(min_goal, state["goal_secs"] - degrade)
        state["consecutive_fails"] = 0


def _gap_start(state: dict) -> Date:
    """待结算区间的起点（上次结算日的次日；没结算过则取昨天）。"""
    today = _game_today()
    last = state.get("last_checked_date") or ""
    if last:
        return Date.fromisoformat(last) + timedelta(days=1)
    return Date.fromisoformat(today) - timedelta(days=1)


def _pending_gap(state: dict, mode: str) -> dict | None:
    """
    返回**整段待裁定区间**（不修改 state），没有则 None。

    从上次结算日的次日推进到昨天：达标日自动算掉、不计入区间。一旦遇到第一个
    **未达标日（含时长为 0 / 没开 app）**，从这天到昨天就是一整段「需要裁定」的
    区间——一次弹窗、一个理由、整段一起跳过或整段算中断。

    没开 app 的日子天然落在这段里（它就是 0），不需要单独排除。
    """
    today = Date.fromisoformat(_game_today())
    end = today - timedelta(days=1)  # 到昨天为止
    d = _gap_start(state)

    # 跳过开头连续的达标日（这些会被 _settle_yesterday 自动结算掉）
    while d <= end:
        actual = _calc_effective_secs(_get_runs_for_date(str(d)), mode)
        if actual >= state["goal_secs"]:
            d += timedelta(days=1)
            continue
        break
    else:
        return None  # 区间内全达标 / 空区间

    # d 是第一个未达标日；[d, end] 就是整段待裁定
    block_start, block_end = d, end
    days = (block_end - block_start).days + 1
    total = sum(
        _calc_effective_secs(_get_runs_for_date(str(block_start + timedelta(days=i))), mode)
        for i in range(days)
    )
    return {
        "start": str(block_start),
        "end": str(block_end),
        "days": days,
        "total_effective_secs": total,
        "goal_secs": state["goal_secs"],
    }


def _settle_yesterday(state: dict, mode: str) -> dict:
    """
    自动结算「上次结算日 → 昨天」里开头**连续达标**的日子；遇到第一个未达标日就停下，
    把整段 [未达标日 … 昨天] 留给用户在弹窗里一次性裁定（跳过 / 算中断）。

    达标日：连续达标 +1、目标上升、推进 last_checked_date。
    第一个未达标日（含 0 / 没开 app）：停在它前一天，等 settle_gap 处理整段。
    """
    today = _game_today()
    if state.get("last_checked_date") == today:
        return state  # 今天已结算过

    end = Date.fromisoformat(today) - timedelta(days=1)
    d = _gap_start(state)

    while d <= end:
        actual = _calc_effective_secs(_get_runs_for_date(str(d)), mode)
        if actual >= state["goal_secs"]:
            _settle_hit(state)
            state["last_checked_date"] = str(d)
            d += timedelta(days=1)
        else:
            # 第一个未达标日 → 停在它前面，整段交给用户裁定
            state["last_checked_date"] = str(d - timedelta(days=1))
            return state

    # 区间内全达标（或本就无区间）
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


class BestRecord(BaseModel):
    value: int       # 最佳数值（专注秒数 / 星星数）
    date: str        # 发生在哪一天（空串=暂无记录）


@router.get("/best-records")
def get_best_records():
    """
    历史最佳记录：
      - best_focus：单日有效专注时长的历史最高（按当前口径），及发生日期。
      - best_stars：单日「今日获得」星星历史最高（= 完成任务得分 + 当天赢麻了星星，
        与主页星星墙口径一致），及发生日期。
    用于在目标卡 / 主页星星墙展示「历史最佳，发生于 X」。
    """
    import os as _os_b
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")

    # 单日专注最高
    runs: list = _read(_os_b.path.join(DATA_DIR, "task_runs.json"), [])
    focus_per_day: dict[str, int] = {}
    score_per_day: dict[str, int] = {}
    for r in runs:
        d = r.get("date", "")
        if not d:
            continue
        if r.get("success"):
            score_per_day[d] = score_per_day.get(d, 0) + (r.get("score", 0) or 0)
        if r.get("success") and r.get("started_at"):
            secs = r.get("actual_seconds", 0) or 0
            planned = int(r.get("task_hours", 1.0) * 3600)
            val = min(secs, planned) if mode == "planned" else secs
            if not r.get("count_in_effective", True):
                val = 0
            focus_per_day[d] = focus_per_day.get(d, 0) + val
    best_focus = BestRecord(value=0, date="")
    if focus_per_day:
        bd = max(focus_per_day, key=lambda k: focus_per_day[k])
        best_focus = BestRecord(value=focus_per_day[bd], date=bd)

    # 单日「今日获得」星星最高 = 任务得分 + 赢麻了星星（与主页口径一致）
    from storage.records import load_wins
    stars_per_day: dict[str, int] = dict(score_per_day)
    for w in load_wins():
        d = w.get("created_at", "")[:10]
        if not d:
            continue
        stars_per_day[d] = stars_per_day.get(d, 0) + (w.get("stars", 0) or 0)
    best_stars = BestRecord(value=0, date="")
    if stars_per_day:
        bd = max(stars_per_day, key=lambda k: stars_per_day[k])
        best_stars = BestRecord(value=stars_per_day[bd], date=bd)

    return {"best_focus": best_focus, "best_stars": best_stars}


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


@router.get("/history-stats")
def get_history_stats(days: int = 7):
    """返回最近 N 天每天的学习时间（秒）和得分，用于趋势图。"""
    import os as _os_h
    from datetime import timedelta as _td_h
    days = max(1, min(90, days))
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    excluded = load_excluded_dates()
    runs_path = _os_h.path.join(DATA_DIR, "task_runs.json")
    all_runs: list = _read(runs_path, [])
    today = Date.fromisoformat(_game_today())
    result = []
    for i in range(days - 1, -1, -1):
        d = str(today - _td_h(days=i))
        day_runs = [r for r in all_runs if r.get("date") == d and r.get("started_at")]
        effective = _calc_effective_secs(day_runs, mode)
        score = sum(r.get("score", 0) for r in day_runs if r.get("success"))
        result.append({
            "date": d,
            "effective_secs": effective,
            "score": score,
            "excluded": d in excluded,
        })
    return result


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


class PendingGap(BaseModel):
    start: str                  # 待裁定区间起点（第一个未达标日）
    end: str                    # 区间终点（昨天）
    days: int                   # 区间天数
    total_effective_secs: int   # 区间内累计有效时间
    goal_secs: int              # 当时的目标


@router.get("/goal/pending-gap", response_model=PendingGap | None)
def get_pending_gap():
    """
    返回需要用户一次性裁定的**整段区间**——从上次结算后第一个未达标日到昨天。
    没有则返回 null（达标正常推进、或第二天正常打开）。

    用户重开 app 时前端拉这个：有则**一个弹窗**问整段是「跳过（有事/状态不好，
    不计入）」还是「算中断（整段按未达标计）」。没开 app 的日子天然在这段里。
    """
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    state = _load_goal_state()
    gap = _pending_gap(state, mode)
    return PendingGap(**gap) if gap else None


class SettleGapBody(BaseModel):
    decision: Literal["skip", "count"]   # skip=整段不计入 / count=整段算未达标
    reason: str = ""


@router.post("/goal/settle-gap")
def settle_gap(body: SettleGapBody):
    """
    对**整段待裁定区间**一次性裁定：
      - skip：整段跳过——每天写入 excluded_dates（带同一理由），不计入目标升降。
      - count：整段算中断——每天按未达标结算（连续失败累加，可能触发降级）。
    裁定后 last_checked_date 推进到昨天，目标卡片随即正常。
    """
    cfg = load_config()
    mode = cfg.get("effective_time_mode", "actual")
    state = _load_goal_state()
    gap = _pending_gap(state, mode)
    if not gap:
        return {"ok": True}  # 没有待裁定区间，幂等返回

    start = Date.fromisoformat(gap["start"])
    end = Date.fromisoformat(gap["end"])
    days = (end - start).days + 1

    if body.decision == "skip":
        excluded = load_excluded_dates()
        for i in range(days):
            excluded[str(start + timedelta(days=i))] = body.reason or "状态不在线"
        save_excluded_dates(excluded)
    else:  # count：整段每天计未达标
        for _ in range(days):
            _settle_fail(state)

    # 整段处理完，推进到昨天
    state["last_checked_date"] = str(end)
    _save_goal_state(state)

    # 常规任务一并套用同一决定（跳过=请假桥接 / 算中断=计失败），不再单独弹窗
    _settle_routines_for_range(gap["start"], gap["end"], body.decision, body.reason)
    return {"ok": True}


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

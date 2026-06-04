import uuid
import random
from datetime import date as Date
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage.tasks import (
    load_templates, save_templates,
    load_daily_tasks, save_daily_tasks,
    load_bounty_pool, save_bounty_pool,
    load_daily_bounties, save_daily_bounties,
)

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

@router.get("/daily", response_model=list[DailyTask])
def get_daily_tasks(date: str | None = None):
    today = date or str(Date.today())
    return load_daily_tasks(today)

@router.post("/daily/init", response_model=list[DailyTask])
def init_daily_tasks(date: str | None = None):
    """用模板初始化当日任务（每天第一次打开时调用）。"""
    today = date or str(Date.today())
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
        }
        for t in templates
    ]
    save_daily_tasks(today, tasks)
    return tasks

@router.post("/daily", response_model=DailyTask, status_code=201)
def add_daily_task(body: DailyTaskCreate, date: str | None = None):
    today = date or str(Date.today())
    tasks = load_daily_tasks(today)
    task = {"id": str(uuid.uuid4()), **body.model_dump(), "done": False, "from_template": False}
    tasks.append(task)
    save_daily_tasks(today, tasks)
    return task

@router.put("/daily/{task_id}", response_model=DailyTask)
def update_daily_task(task_id: str, body: DailyTaskCreate, date: str | None = None):
    today = date or str(Date.today())
    tasks = load_daily_tasks(today)
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i] = {**t, **body.model_dump()}
            save_daily_tasks(today, tasks)
            return tasks[i]
    raise HTTPException(404, "任务不存在")

@router.patch("/daily/{task_id}/done", response_model=DailyTask)
def toggle_done(task_id: str, date: str | None = None):
    today = date or str(Date.today())
    tasks = load_daily_tasks(today)
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i]["done"] = not tasks[i]["done"]
            save_daily_tasks(today, tasks)
            return tasks[i]
    raise HTTPException(404, "任务不存在")

@router.delete("/daily/{task_id}", status_code=204)
def delete_daily_task(task_id: str, date: str | None = None):
    today = date or str(Date.today())
    tasks = load_daily_tasks(today)
    save_daily_tasks(today, [t for t in tasks if t["id"] != task_id])

# ── 赏金任务库 ───────────────────────────────────────────────

@router.get("/bounty/pool", response_model=list[BountyTask])
def list_bounty_pool():
    return load_bounty_pool()

@router.post("/bounty/pool", response_model=BountyTask, status_code=201)
def create_bounty(body: BountyCreate):
    pool = load_bounty_pool()
    b = {"id": str(uuid.uuid4()), **body.model_dump()}
    pool.append(b)
    save_bounty_pool(pool)
    return b

@router.put("/bounty/pool/{bid}", response_model=BountyTask)
def update_bounty(bid: str, body: BountyCreate):
    pool = load_bounty_pool()
    for i, b in enumerate(pool):
        if b["id"] == bid:
            pool[i] = {"id": bid, **body.model_dump()}
            save_bounty_pool(pool)
            return pool[i]
    raise HTTPException(404, "赏金任务不存在")

@router.delete("/bounty/pool/{bid}", status_code=204)
def delete_bounty(bid: str):
    pool = load_bounty_pool()
    save_bounty_pool([b for b in pool if b["id"] != bid])

# ── 每日赏金分配 ─────────────────────────────────────────────

@router.get("/bounty/daily", response_model=list[DailyBounty])
def get_daily_bounties(date: str | None = None):
    today = date or str(Date.today())
    return load_daily_bounties(today)["bounties"]

@router.post("/bounty/daily/generate", response_model=list[DailyBounty])
def generate_daily_bounties(date: str | None = None):
    """每日随机抽取赏金任务（已生成则直接返回）。"""
    today = date or str(Date.today())
    existing = load_daily_bounties(today)
    if existing["generated"]:
        return existing["bounties"]
    pool = load_bounty_pool()
    if not pool:
        save_daily_bounties(today, {"generated": True, "bounties": []})
        return []
    count = random.randint(0, min(3, len(pool)))
    selected = random.sample(pool, count)
    bounties = [
        {**b, "status": "pending"}
        for b in selected
    ]
    save_daily_bounties(today, {"generated": True, "bounties": bounties})
    return bounties

@router.patch("/bounty/daily/{bounty_id}", response_model=DailyBounty)
def respond_bounty(bounty_id: str, status: Literal["accepted", "skipped"], date: str | None = None):
    today = date or str(Date.today())
    data = load_daily_bounties(today)
    for i, b in enumerate(data["bounties"]):
        if b["id"] == bounty_id:
            data["bounties"][i]["status"] = status
            save_daily_bounties(today, data)
            return data["bounties"][i]
    raise HTTPException(404, "赏金任务不存在")

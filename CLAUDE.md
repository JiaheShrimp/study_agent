# Agent 项目指南

本文档是 Claude Code 的工作规范，每次对话都会自动加载。所有代码风格、架构决策、命名约定以此为准。

---

## 项目简介

一个游戏化的个人成长 Agent。通过每日抽奖倍数、任务追踪、赢麻了记录、追逐式计时器等机制，把枯燥的自我管理变得有趣。用户每天打开时抽取当日倍数，完成任务获得激励，记录进步积累成就感。后期接入 AI 做趋势分析和目标规划。

---

## 技术栈

| 层级 | 选型 | 备注 |
|------|------|------|
| 后端语言 | Python 3.12 | Miniconda 环境 |
| 后端框架 | FastAPI + uvicorn | REST API，热重载 |
| AI 客户端 | urllib（内置）| 零依赖，支持 Anthropic / OpenAI 兼容所有 provider |
| 存储 | JSON 文件 | 后期可迁移 SQLite |
| 前端框架 | React 19 + Vite + TypeScript | |
| UI 组件 | shadcn/ui + Tailwind CSS v3 | 暖米白纸质感配色 |
| 图表 | Recharts | 分析页柱状图 |
| 路由 | react-router-dom v7 | |
| 字体 | Noto Sans SC + Inter | Google Fonts CDN |
| 桌面托盘 | pystray + Pillow | 托盘启动，无黑窗口 |
| 通知 | winotify | Windows 原生 Toast |
| 音效 | Web Audio API | 纯代码合成，无外部音频文件 |

---

## 项目结构

```
agent/
├── app.py                   # 托盘启动器，双击 启动.vbs 运行
├── 启动.vbs                 # 静默启动脚本（本地，不上传 git）
├── backend/
│   ├── main.py              # FastAPI 入口，注册所有 router
│   ├── routers/
│   │   ├── wins.py          # 赢麻了 API（CRUD + 统计）
│   │   ├── bonus.py         # 每日倍数抽奖 API
│   │   ├── tasks.py         # 任务系统 API（模板/当日/赏金/执行记录/常规/目标）
│   │   └── config.py        # 提醒 + 工作休息 + 有效时间口径 配置 API
│   ├── storage/
│   │   ├── records.py       # wins.json 读写
│   │   ├── tasks.py         # 任务相关 JSON 读写（含 routines / daily_exclude / goal_state）
│   │   ├── buffs.py         # Buff 模板定义 + random_buff()
│   │   └── config.py        # config.json 读写
│   └── data/                # 所有 JSON 数据文件（不上传 git）
│       ├── wins.json
│       ├── config.json      # reminder / work_mins / rest_mins / effective_time_mode
│       ├── task_templates.json
│       ├── daily_tasks.json # 按日期分组的当日任务，含 run_status
│       ├── bounty_pool.json
│       ├── daily_bounties.json
│       ├── task_runs.json   # 任务执行记录（含 started_at/ended_at/actual_seconds/source）
│       ├── routines.json    # 常规任务列表 + max_routines / fail_days_limit
│       ├── daily_exclude.json  # {"YYYY-MM-DD": "排除理由"}
│       └── goal_state.json  # 爬坡目标状态（goal_secs / streaks / params）
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx          # 路由 + 老虎机逻辑（8点后触发，后端无响应则不弹）
│   │   ├── index.css        # 全局样式 + CSS 变量（暖米白配色）
│   │   ├── lib/
│   │   │   ├── api.ts       # 所有后端请求封装（含类型定义）
│   │   │   ├── sounds.ts    # Web Audio API 音效合成（无外部文件）
│   │   │   └── utils.ts     # cn() 工具
│   │   ├── components/
│   │   │   ├── layout/      # AppLayout（含今日倍数条）, Sidebar, BottomNav
│   │   │   ├── ui/          # Button, Card, Dialog, Select
│   │   │   ├── SlotMachine.tsx    # 每日抽奖老虎机弹窗
│   │   │   ├── TaskRunner.tsx     # 任务追逐计时器（时间戳计时 + 圆形跑道 + PiP 悬浮窗 + localStorage 关窗恢复）
│   │   │   ├── DayTimeline.tsx    # 今日时间轴（Dashboard 展示，竖排）
│   │   │   └── StudyGoalCard.tsx  # 有效学习时间 + 爬坡目标卡片（compact / 详细）
│   │   └── pages/
│   │       ├── Dashboard.tsx      # 首页（问候 + 倍数卡 + 目标卡 + 功能入口 + 时间轴）
│   │       ├── Wins.tsx           # 赢麻了（月历 + 记录 + 新增 + 分析抽屉）
│   │       ├── Tasks.tsx          # 每日任务（日历切换历史 + 常规任务 + 当日任务 + 赏金）
│   │       ├── TasksManage.tsx    # 任务管理（模板库 + 赏金任务库）
│   │       └── Placeholder.tsx    # Plan 占位页
│   ├── package.json
│   └── vite.config.ts       # /api → localhost:8000 代理
└── CLAUDE.md
```

---

## 启动方式

**后端**（终端 1）：
```
cd backend
python -m uvicorn main:app --reload
```

**前端**（终端 2）：
```
cd frontend
npm install   # 首次
npm run dev
```

访问 `http://localhost:5173`

**托盘启动**（日常使用）：
双击 `启动.vbs`，静默启动前后端，3 秒后自动打开浏览器，系统托盘显示图标。

---

## 核心概念与命名约定

| 业务概念 | 代码命名 | 说明 |
|----------|----------|------|
| 今日进步记录 | `win` | 单条赢麻了记录 |
| 进步等级 | `win_level` | `small` / `medium` / `big` / `future` |
| 星星数 | `stars` | small=1, medium=2, big=3, future=0 |
| 每日倍数 | `daily_bonus` / `multiplier` | 1.0-3.0，三数平均映射 |
| 游戏日 | game date | 以每天 **00:00** 为起点，与自然日对齐 |
| 任务模板 | `task_template` | 每天自动复制到当日任务的模板 |
| 当日任务 | `daily_task` | 当天的具体任务实例，可编辑 |
| 赏金任务 | `bounty_task` | 每天随机抽取 0-2 个，可接受/跳过，携带 buff |
| 常规任务 | `routine_task` | 习惯养成任务，有连续打卡/目标天数/连续失败警告，紫色主题 |
| 任务执行 | `task_run` | 一次任务的完整执行记录（TaskRunner 或手动勾选） |
| 执行来源 | `source` | `runner`=倒计时完成 / `manual`=直接勾选完成 / `routine`=常规任务打卡 |
| 计入有效时间 | `count_in_effective` | 任务及对应 task_run 上的布尔字段；`false` 时不计入有效学习时间统计，时间轴仍显示 |
| 任务结果 | `run_status` | `none` / `running_failed` / `completed` |
| 工作段 | work block | 配置项，用于换算休息预算总额（默认 30 分钟）；计时本身不再分段 |
| 休息预算 | rest budget | 总额 = 按预计时长换算（`预计时长 / work_mins × rest_mins`），开局一次性给满；**仅在用户手动点暂停时消耗**（与窗口前后台无关），耗尽则失败；以剩余时间（mm:ss）显示。例：1h 任务、每 30min 休息 5min → 10 分钟 |
| 进行中快照 | `ActiveRunSnapshot` | 计时进行中实时写入 localStorage（`agent.activeRun`）的进度，用于关窗后恢复或判中断 |
| 结束原因 | `end_reason` | `complete`=跑到终点 / `early`=提前完成 / `giveup`=中断 / `failed`=力竭倒下 |
| 有效学习时间 | effective time | 实际口径（actual_seconds）或计划口径（min(actual, task_hours×3600)） |
| 排除日 | excluded date | 手动标记不计入目标计算的日期，需填写理由 |
| 学习目标 | goal | 爬坡机制：每日单阈值，达标+step_mins，连续未达标超限则降级 |
| 奖励点数 | score | 每次任务完成后计算，失败/中断为 0 |
| Buff | buff | 赏金任务必得、日常任务 20% 概率抽取的奖励加成 |
| 漏打结算 | settlement | 常规任务漏打的历史日，下次打开逐天结算为请假（excused）或中断（missed） |

---

## 游戏化机制

### 每日抽奖（已实现）
- 每天**零点后**第一次打开自动弹出老虎机
- 三个滚轮各抽 1-5（权重递减），平均值映射到 1.0-3.0×
- 游戏日以零点为界，与自然日对齐
- 当天倍数显示在全局顶部条 + Dashboard 卡片
- **容错**：后端无响应时不弹老虎机（不报错）；保存成功才关闭弹窗
- **音效**：滚动 tick → 每轮停止和弦音 → 全停琶音（倍数越高越高亢）

### 赢麻了（已实现）
- **小赢** ★：做到了一件事
- **中赢** ★★：明显进步
- **特大赢** ★★★：重大突破
- **未来可赢** ◇：今天没做好，但以后可以做到（0 星，靛蓝配色，不计入星数统计）
- 月历视图：有星数的日期显示 ★ N，只有未来可赢的日期显示 ◇
- 分析抽屉：等级分布中 small/medium/big 按比例展示，future 单独列于分隔线下方
- 记录成功时有音效，星级越高音符越多越响亮

### 可赢目标（已实现）
- 挂在赢麻了页面的「未来可赢」，类似常规任务但更轻：靛蓝（indigo）主题，存 `winnables.json`
- **入口复用「记录未来可赢」输入框**：QuickAdd 选「未来可赢」等级记一条时，**不直接写当日赢记录**，而是调 `createWinnable` 挂成一个可赢目标（出现在上方卡片）。可赢目标卡片**没有自己的输入框**，靠 `refreshTick` 在 QuickAdd 记录后重新拉列表；空状态提示去下面输入框写
- **可赢目标自带星级**（`win_level`：small/medium/big，不含 future）：选「未来可赢」chip 时，下方出现「赢一次算 ★/★★/★★★」二级选择器，挂目标时选定一次，之后固定。卡片左侧显示对应星级 badge
- 每条展示：星级 badge + 连续赢天数（🔥 streak）+ 累计赢次数（🏆 total_wins）
- **赢一次**：点一下 → `total_wins +1`，当天写入 `win_days`（同一天多点只计一次连续，但 total_wins 照常累加）→ **此时**才复制内容进**当日赢记录**，**按目标设定的星级**（如 medium=2 星，不再固定 future/0 星）；赢 N 次点 N 次，当日记录就多 N 条。刷新日历/今日列表 + 播 `playWinRecord(win_level)` + 派发 `agent:dialogue-refresh`
- **连续天数**：`win_days` 日期集合全量重算（`_recalc_streak`，类似常规任务），最近一次赢是今天或昨天才算「仍在连续」，否则归零；同时算历史最长 `best_streak`
- **赢太多了**：点一下 → `archived=True` + `archived_date`，该项从页面消失，进入「历史」抽屉（展示累计次数 + 最长连续 + 归档日期）
- 接口：`GET/POST /wins/winnables`、`POST /wins/winnables/{id}/win`、`POST /wins/winnables/{id}/archive`、`GET /wins/winnables/archived`、`DELETE /wins/winnables/{id}`

### 每日任务（已实现）
- 任务模板库 → 每天自动复制为当日任务
- 快速添加：Enter / 空格 即保存，光标留在输入框
- 每条任务有：内容、预计时长(h)、重要程度(1-5 星)
- 任务状态区分：完成（绿勾划线）/ 失败（红色划线，标注"X% · 失败·可重试"）/ 未开始
- 失败/中断任务显示完成百分比，可直接点 ▶ 重试，成功任务不能再启动
- **直接勾选完成**：不经过计时器直接打勾，写入 `source=manual` 的 task_run；`count_in_effective=true`（默认）时计入有效学习时间，`false` 时只在时间轴展示不计时，得分为 0；取消勾选则删除该记录
- **不计入学习时间**：添加/编辑任务时可勾选「不计入学习时间」（`count_in_effective` 字段）；对应 task_run 同步写入该字段，时间轴标注「不计时」灰色小字，底部累计专注时间不包含此类记录
- **保留任务（跨天不消失）**：添加/编辑任务时可勾选「保留任务」（`keep` 字段，sky 蓝主题，列表显示「保留」badge）。未必今天完成、以后某天再做的任务——不会随当天过去而刷新消失。`init_daily_tasks` 每次（今天首开）调 `_migrate_kept_tasks`：扫描所有早于今天的日期，把其中**未完成**（done/completed 之外）的保留任务从原日期移除、合并进今天列表（保留原 id / 进度 / run_status，paused 也带过来）。已完成的保留任务留在原日期不迁。计算/显示/计时与普通任务**完全一致**（它在今天列表里就是个普通 DailyTask）
- **历史回溯**：Tasks 页顶部月历切换日期，历史日任务只读（不可编辑/添加/启动）

### 常规任务（已实现）
- 独立于每日任务的习惯养成模块，紫色/violet 主题区分
- 每条常规任务有：内容、预计时长、重要程度、目标天数
- 打卡状态：今日已完成 / 未完成；`last_done_date` 存最近打卡日期
- 连续打卡天数（`streak`）、历史最长连续、累计完成天数
- **streak 计算**：从 log 全量重算（`_recalc_streak`），支持任意日期写入后结果一致
- **连续失败警告**：创建日期后连续 N 天未打卡（`fail_days_limit`，用户可设）触发强制提示；创建当天不计入失败
- 用户可设最大同时存在的常规任务数（`max_routines`，默认 3）
- 常规任务按习惯维度统计，不按天统计（不出现在历史任务列表）
- **漏打结算（excused）**：放假/连续几天没打开 app 的日子既未打卡也未请假，属「未结算」状态，**不计入连续失败**（避免被误判归档）。下次打开时 `RoutineSettlement` 弹窗逐个任务、逐天提示用户结算：
  - **正当请假**：写入 `routine.excused[day]=理由`，桥接 streak（前后打卡视为连续），不计入连续失败
  - **算作中断**：写入 `routine.log[day]=False`，计入连续失败，连续超 `fail_days_limit` 触发归档
  - `_count_fail_days` 跳过 excused 日和未结算日（`day not in log`），仅 `log[day] is False` 计失败
  - `_recalc_streak` 中两次打卡之间若全是 excused 日则桥接连续
  - 接口：`GET /tasks/routines/pending-settlement`（返回各任务待结算日期）、`POST /tasks/routines/{id}/settle`（批量提交某任务的结算项）

### 任务追踪（已实现）
- hover 任务 → ▶ 开始 → 3-2-1 倒计时（显示任务时长 + 总休息预算）→ 全屏追逐跑道
- **计时基于时间戳算差值，不靠 requestAnimationFrame 累加**：已工作时长 = `performance.now() 流逝 − 暂停时长`，`setInterval(250ms)` 仅负责刷新显示。这样**窗口缩小 / 被别的程序盖住 / 切标签页都照常走表**（旧的 rAF 累加方案在后台标签页会被浏览器挂起，导致计时停住——已废弃）
- **主计时器正计时**：从 0 开始算「已用时间」（`workedSecs`），不是倒计时；进度环 = `已用 / 预计`，封顶 100%
- **到达预计时间不结束**：`workedSecs ≥ totalSecs` 时触发到点提示（橙色横幅 + `playGoalReached()` 音效，`reachedRef` 防重复），**继续计时**进入超时态（`overtime=true`），等用户自己点「完成任务」才结束
- **超时态视觉**：主时间数字 / 已完成% / 进度环 / 中央状态文字均变琥珀色，副标题显示「超出预计 mm:ss」
- **圆形跑道**：小人沿圆环奔跑，进度对应圆弧角度，帧动画切换 emoji；超时后小人停在终点（runnerPct 封顶 92）
- **暂停 = 用户手动点，与窗口前后台无关**：只有手动点「暂停」才消耗休息预算（右下角 mm:ss，不足 60s 变红）。缩小页面去做学习任务**不算暂停、不扣预算、不判失败**——计时引擎不再把「页面不在前台」当成偷懒
- **悬浮窗（Document Picture-in-Picture）**：计时页「⊡ 悬浮窗」按钮把计时器弹成 280×200 小窗，浮在所有程序之上、跟随屏幕；内含时间/进度/暂停/完成。仅 Chrome/Edge 支持（不支持时 alert 提示）。用 `createPortal` 把精简版计时 UI 渲染进 PiP 文档，并克隆主文档样式表保证 Tailwind 生效
- **关窗恢复**：计时进行中实时把进度快照（`ActiveRunSnapshot`）写入 `localStorage`（key=`agent.activeRun`）。下次打开 Tasks 页检查未结束计时：**≤10 分钟**前离开 → 弹 `ResumeRunDialog` 问「是否继续」（继续=无缝续传，算中断=按 giveup 记录）；**>10 分钟** → 直接按中断保存。计时正常结束/中断/力竭时清除快照
- **工作/休息可配置**：Tasks 页顶部计时器按钮打开设置，`work_mins` / `rest_mins` 存 config.json
- 休息预算耗尽 → 失败（力竭）；完成按钮：未到预计时间点 = 提前完成（`early`，享加成），到点或超时点 = 正常完成（`complete`）；可随时「中断任务」
- 结果页区分 4 种结局：🏆 完成 / ⚡ 提前完成 / 🚩 中断（显示完成%）/ 💀 力竭倒下
- 无论成功/失败/中断，均保存执行记录到时间轴（`source=runner`）
- 失败/中断任务在列表中划线显示，不消失，可重试

### 时间轴（已实现）
- Dashboard 底部展示今日任务时间轴，竖排布局
- 每条记录：左侧时间范围 + 任务名，右侧横向进度条（实线=工作，斜纹=暂停）
- 成功/失败/中断记录均展示，失败显示完成百分比
- **手动勾选记录**（`source=manual`）：进度条满格，任务名后标注「手动」小字；悬停时间区域显示铅笔图标，点击可修改开始时间（`HH:MM`），结束时间自动 = 开始 + actual_seconds
- 底部累计：仅统计 `count_in_effective=true` 的完成任务工作时长（不含暂停/休息）
- `actual_seconds=0` 的记录不显示在时间轴（如时长设为 0 的常规习惯任务）
- 常规任务打卡（`source=routine`）也会出现在时间轴，任务名后标「常规」紫色小字

### 有效学习时间 & 爬坡目标（已实现）
- **有效时间两种口径**（用户可切换，存 config.json）：
  - 实际口径 `actual`：`actual_seconds`（不含暂停）
  - 计划口径 `planned`：`min(actual_seconds, task_hours × 3600)`
- **直接勾选完成的任务**：`actual_seconds = task_hours × 3600`，两种口径结果相同
- **排除日**：手动标记今天不计入，必须填写理由；历史任务页可查看理由
- **爬坡目标**（`goal_state.json`）：
  - 统一从 1h 起步；达标 → 次日 +step_mins；连续 fail_limit 天未达标 → -degrade_mins（不低于 min_goal_mins）
  - `GET /tasks/goal` 每次调用自动结算昨日并更新状态
  - 展示：连续达标天数（🔥）、距目标差距、连续未达标预警
  - 用户可配置：step_mins / fail_limit / degrade_mins / min_goal_mins / goal_mins（直接修改当前目标）
- **StudyGoalCard**：compact 版在 Dashboard，详细版在 Tasks 页顶部

### 每日提醒（已实现）
- 托盘程序后台每 30 秒检查提醒时间
- Windows Toast 通知，点击直接打开应用
- 在赢麻了页面「提醒」按钮中设置，支持多个时间点

### 音效系统（已实现）
所有音效通过 `frontend/src/lib/sounds.ts` 的 Web Audio API 合成，无需外部音频文件。

| 函数 | 触发时机 |
|------|---------|
| `playSlotTick()` | 老虎机滚动，每经过一格（减速后停止触发） |
| `playReelStop(i)` | 第 i 个滚轮停止，D/F#/A 三和弦依次响起 |
| `playSlotComplete(m)` | 三轮全停后上行琶音，倍数越高音越高亢 |
| `playWinRecord(level)` | 记录赢麻了成功，星级越高音符越多越响亮 |
| `playBountyAppear()` | 赏金任务首次弹出，低→高神秘感三音 + 铃声余韵 |
| `playGoalReached()` | 任务正计时达到预计时间，柔和上行三音（提醒可收尾，不打扰） |
| `playClick()` | 通用按钮点击轻音 |

**注意**：Web Audio API 需要用户交互后才能播放（浏览器限制），已在 `getCtx()` 中处理 suspended 状态。

### 奖励点数系统（已实现）

#### 得分计算（`_calc_score` in `routers/tasks.py`）
失败 / 中断任务得分为 0，成功任务按以下公式计算：

```
基础分 = stars × ceil(有效时长 / 0.5h)

有效时长（与有效时间口径对齐）：
  实际口径：actual_seconds / 3600
  计划口径：min(actual_seconds, task_hours × 3600) / 3600

加成系数（所有满足条件的系数相乘）：
  零暂停       pause_count == 0              × 1.3
  少暂停       0 < pause_count ≤ 计划段数-1  × 1.1  （计划段数=ceil(task_hours/0.5)）
  省休息       rest_remaining_secs > 0       × 1.2
  提前完成     end_reason == "early"          × 1.1
  每日倍数     当日 multiplier（1.0-3.0）     × multiplier

最终得分 = round(基础分 × 所有加成系数)
```

注意：零暂停和少暂停互斥（zero_pause 触发则 few_pause 不触发）；暂停次数阈值始终按**计划段数**算，不随提前完成缩水。手动勾选完成的任务（`source=manual`）不走 `_calc_score`，得分简化为：`round(stars × ceil(有效时长/0.5h) × multiplier)`，不叠加暂停/休息/提前完成加成。

#### Buff 系统（已实现数据结构，效果待接入）

Buff 定义在 `storage/buffs.py`，共 6 种固定模板，系数随机生成：

| Buff | emoji | 类型 | 触发条件 | 系数范围 |
|------|-------|------|----------|----------|
| 专注冲刺 | 🎯 | `task_score` | 零暂停时得分额外加乘 | ×1.3~2.0 |
| 闪电完成 | ⚡ | `task_score` | 提前完成时得分额外加乘 | ×1.3~2.0 |
| 今日燃烧 | 🔥 | `daily_score` | 当天所有任务得分均加乘 | ×1.1~1.5 |
| 免死金牌 | 🛡️ | `goal_shield` | 今天不计入连续失败次数 | 无系数 |
| 加速成长 | 🌱 | `routine_double` | 常规任务打卡 total_done +2 | 无系数 |
| 幸运加注 | 🎰 | `lucky_dice` | 明天抽奖骰子各 +1（上限5） | 无系数 |

#### 赏金任务 Buff（已实现）
- **AI 派发（搭子接管赏金）**：有 AI key 时，`_ai_select_bounties` 不再机械筛选任务名，而是把**完整画像**喂给 AI——`supervisor_context.build_summary()`（赢麻了/专注时长/习惯）+ `_task_profiles()`（每个任务做过几次、成功几次、最近一次什么时候）。AI 以「懂你的搭子为你着想」口吻挑出/设计此刻对你有意义的任务，并给一句**派发理由**（`reason`，≤30字，搭子口吻），展示在赏金卡片上。返回 `[{content, hours, stars, reason}]`，最多保留 2 条**有效**任务（脏数据不占名额）。无 AI key 降级为从历史去重随机抽取（`reason` 为空）
- 内容从全历史 `task_runs` 去重随机抽取（降级模式，不限今日）
- 每日生成 0-2 个，每条随机分配一个 buff + 随机弹出时间（游戏日 08:00 内随机）
- 前端每 60 秒轮询 `GET /bounty/daily/pending`，**首次出现**的新赏金自动弹窗 + 音效
- 已弹过的赏金 id 记录在 `shownBountyIds` ref（会话级），不重复弹
- 状态流转：`pending → accepted → done` 或 `pending → expired`
- 完成赏金任务**必然**获得对应 buff（效果待接入结算逻辑）

#### 日常任务 Buff（待实现）
- 完成任务后 **20% 概率**随机抽取一个 buff
- buff 随机，完成时才知道结果

### 待开发
- [ ] Buff 效果实际结算接入（task_score / daily_score / goal_shield / routine_double / lucky_dice）
- [ ] 日常任务 20% 概率 buff 抽取
- [ ] 积分展示页面（历史得分、buff 收集记录）
- [ ] 学习计划页面
- [ ] AI 趋势分析（Anthropic SDK）
- [ ] 历史回顾页面
- [ ] Electron 打包（功能稳定后）

---

## 架构设计

### 数据流
```
用户操作（前端）
    ↓ fetch /api/*
Vite 代理 → FastAPI（:8000）
    ↓
routers/*.py（业务逻辑）
    ↓
storage/*.py（JSON 读写）
    ↓
backend/data/*.json
```

### 关键设计决策
- **storage 层隔离**：routers 不直接操作文件，必须通过 storage/ 层
- **游戏日边界**：`bonus.py` 中 `_current_game_date()` 统一处理 08:00 边界
- **老虎机容错**：后端无响应时不弹老虎机；`today()` 返回 null（今天未抽）才弹
- **任务执行记录**：`started_at` 在倒计时结束（phase='running'）时记录，非点击时；手动勾选时 `started_at = now - task_hours×3600`
- **task_run source 字段**：`runner`=TaskRunner 产生，`manual`=直接勾选产生，`routine`=常规任务打卡产生；manual 记录可在时间轴编辑开始时间，runner/routine 记录不可编辑
- **task_run count_in_effective 字段**：从任务的 `count_in_effective` 字段继承写入；`_calc_effective_secs()` 跳过该字段为 `false` 的记录；时间轴 `actual_seconds=0` 的记录不展示
- **勾选完成同步写 run**：`PATCH /daily/{id}/done` 勾选时始终写入 manual run（无论是否计时），取消时删除对应 manual run；同一任务只保留一条 manual run（防重复）
- **常规任务时间轴**：`source=routine` 的记录现在出现在时间轴；`hours=0` 的常规任务不写 task_run（不在时间轴显示）
- **任务状态**：`run_status` 字段存在 daily_tasks，区分 none/running_failed/completed；失败不删任务，可重试
- **任务结束统一入口**：所有结束路径（完成/提前/中断/失败）均通过 `finishRun(s, reason)` 处理
- **计时用时间戳算差值**：`computeWorked()` = `initProgress + (performance.now() − startMono)/1000 − pausedTotal − 本次暂停时长`；用 `performance.now()`（单调时钟）而非 `Date.now()`，避免系统改时间跳变。`setInterval(250ms)` 只刷新显示，不参与计时——所以窗口缩小/后台都准。**不再有 rAF 累加、不再有自动休息段（auto-rest）、不再有工作段循环（workSecsLeft）**
- **暂停统计分两份**：`pausedTotalRef`=本会话新增暂停秒（续传时从 0 起，因为 `initProgress` 已扣除续传前暂停，避免双重扣减）；`historicalPausedRef`=续传前累计暂停秒（仅用于显示总暂停时长）。两者相加才是展示用的 `pausedSecs`
- **PiP 悬浮窗**：`documentPictureInPicture.requestWindow()` 开小窗，`createPortal` 把精简计时 UI 渲染进 `pipWindow.document.body`，并克隆主文档 `<style>/<link rel=stylesheet>` 到 PiP head 保证 Tailwind 生效；不支持时 alert 提示，组件卸载时关闭 PiP
- **关窗恢复（10 分钟规则）**：`persist()` 每 tick 把 `ActiveRunSnapshot` 写 localStorage（含 `workedSecs/restSecsLeft/pausedTotal/startedAtISO/savedAtISO`），`finishRun` 清除。Tasks 页挂载 effect 读快照：`Date.now() − savedAtISO ≤ 10min` → 弹 `ResumeRunDialog`（继续=把 `workedSecs/restSecsLeft/pausedTotal` 作为 resume props 传回 TaskRunner 无缝续传；中断=按 giveup 存 run）；超时 → 直接按 giveup 存 run（`actual_seconds=snap.workedSecs`）。saveRun 的 `actual_seconds` 存**总**已工作秒数（含续传进度），便于中断后续传
- **爬坡目标结算**：`_settle_yesterday()` 在每次 `GET /tasks/goal` 时调用，检查昨日是否达标并更新状态
- **历史任务只读**：Tasks 页切换到非今日日期时，所有编辑/添加/启动操作隐藏，`readOnly` prop 传入 TaskRow
- **常规任务不按天统计**：routines 有自己的 log/streak，不出现在 daily_tasks 历史中
- **常规任务 streak 重算**：`_recalc_streak()` 从 log 全量重算，保证结算等任意日期写入后结果一致，不依赖增量逻辑；请假日（excused）视为桥接
- **常规任务 force_warning**：从 `created_date` 起算，创建前的日期不计入连续失败；避免新建当天就触发警告
- **漏打结算三态**：常规任务某历史日有三种状态——`log[day] is True`（打卡）、`log[day] is False`（确认中断，计失败）、`day in excused`（请假，桥接不计失败）；三者皆无则为「未结算」，`_count_fail_days` 暂不计失败，等用户在 `RoutineSettlement` 弹窗结算。这样「放假几天没开 app」不会被误判归档
- **赏金弹窗去重**：`shownBountyIds` ref 记录会话内已弹过的 id，只有新 id 才触发自动弹窗和音效
- **音效初始化**：`AudioContext` 懒创建，首次调用 `getCtx()` 时实例化，suspended 状态自动 resume
- **中断任务为暂停态**：`end_reason=giveup` 对应 `run_status=paused`，不是失败；下次启动时取出最后一条 actual_seconds 作为 `initialWorkedSecs` 传入 TaskRunner，从已有进度继续
- **游戏日边界统一**：后端所有日期判断用 `_game_today()`（在 `routers/tasks.py` 中定义），以零点为日期分界，与自然日对齐

---

## AI 集成

> 以下内容面向开发者，不面向用户。

### 架构

- **`backend/ai_client.py`**：零第三方依赖，用 Python 内置 `urllib.request` 发 HTTP 请求
- 支持两种协议：
  - `anthropic`：用 Anthropic Messages API（`/v1/messages`，`x-api-key` + `anthropic-version` 头）
  - `openai`：用 OpenAI Chat Completions 格式（`/chat/completions`，`Authorization: Bearer` 头）；所有 OpenAI 兼容 provider 均走此协议
- **`PROVIDERS`** dict 定义所有支持的 provider，每条包含 `label / hint_model / hint_key / protocol / base_url`

### 配置存储（`config.json`）

```
ai_provider        选用的 provider id（空=未启用）
ai_api_key         API Key（明文存本地，不上传 git）
ai_model           用户自填模型名（空则用 PROVIDERS 里的 hint_model）
ai_custom_base_url 仅 openai_compat 模式需要，其他 provider 忽略
```

### 可用性检查与降级模式

```python
ai_client.is_available()  # → bool：provider + key 都填了才返回 True
ai_client.chat(prompt)    # → str | None：不可用或出错时返回 None
ai_client.chat_json(prompt)  # → Any | None：自动提取 ```json ... ``` 或裸 JSON
```

调用方必须处理 `None`，降级到内置规则。**不允许因 AI 不可用而抛异常或拒绝用户操作**。

### 当前 AI 功能

| 函数 | 位置 | 作用 | 降级行为 |
|------|------|------|----------|
| `_ai_select_bounties(history, today)` | `routers/tasks.py` | 喂完整画像（build_summary + 任务频次画像），让搭子为你派 0-2 个有意义的任务 + 派发理由 | 返回 None → 随机抽取历史记录 |

### 新增 AI 功能模式

1. 在业务函数中调用 `ai_client.chat()` 或 `chat_json()`
2. 收到 `None` 时回退到规则逻辑，保证功能始终可用
3. 接口响应中可附加 `ai_generated: bool` 字段让前端决定是否展示标记

### 添加新 Provider

在 `ai_client.PROVIDERS` 中新增一条 dict，指定 `protocol`（`"anthropic"` 或 `"openai"`）和 `base_url`，前端设置页下拉列表会自动显示。

---

## 代码风格规范

- 注释语言：中文
- 函数命名：`snake_case`（Python）/ `camelCase`（TypeScript）
- 组件命名：`PascalCase`
- 异步：Python 同步优先；前端 async/await
- 类型注解：必须（Python 所有函数参数和返回值；TS 所有 props 和 API 类型）
- 数据读写：routers 层不直接操作文件，必须通过 `storage/` 层
- UI 风格：Neo-minimalism，暖米白底色，大圆角卡片，muted 配色

---

## 开发规范

### 新增功能流程
1. 先在此文档「核心概念」和「游戏化机制」中定义命名和规则
2. 后端：在 `storage/` 新增读写函数 → 在 `routers/` 新增接口 → 在 `main.py` 注册
3. 前端：在 `api.ts` 新增类型和请求函数 → 实现页面/组件 → 在 `App.tsx` 注册路由

### 禁止事项
- 禁止 routers 层直接操作 JSON 文件（必须走 storage 层）
- 禁止跳过 TypeScript 类型注解
- 禁止在组件内直接 fetch，必须通过 `api.ts` 封装
- 禁止硬编码日期逻辑，统一使用 `_current_game_date()`

---

## 当前开发阶段

**当前阶段**：核心功能完善中

**已完成**：
- [x] FastAPI 后端 + React 前端脚手架
- [x] 响应式布局（桌面侧边栏 + 手机底部导航）
- [x] 每日抽奖老虎机（滚轮动画 + 倍数计算 + 08:00 游戏日边界 + 后端容错 + 音效）
- [x] 赢麻了模块（月历 + 记录 + 快速添加 + 删除 + 分析抽屉 + 音效）
- [x] 未来可赢等级（0星/靛蓝配色，不计入星数，月历单独显示 ◇，分析抽屉单独列）
- [x] 每日任务模块（模板库 + 当日任务 + 赏金任务 + 管理页）
- [x] 直接勾选完成计入学习时间（写 manual task_run，取消时删除；支持「不计入学习时间」选项）
- [x] 任务追踪器（3-2-1 倒计时 + 圆形追逐跑道 + 暂停/失败/提前完成/中断 + 结果页）
- [x] 计时改时间戳驱动（窗口缩小/后台照常走表，废弃 rAF 累加）+ 暂停只由用户手动控制、与窗口前后台解耦
- [x] PiP 悬浮窗（Chrome/Edge，计时器挂屏幕角落，边学习边看）
- [x] 关窗恢复（localStorage 快照，≤10 分钟弹窗续传，超时按中断记录）
- [x] 任务状态持久化（run_status：完成/失败/重试，时间轴均记录）
- [x] 每日时间轴（竖排展示，手动完成记录可编辑开始时间，区分 runner/manual/routine 来源；常规任务标「常规」紫色；不计时任务标「不计时」灰色；hours=0 不显示）
- [x] 每日提醒（托盘 + winotify Toast 通知）
- [x] 托盘启动器（app.py + 启动.vbs，无黑窗口）
- [x] GitHub 仓库（https://github.com/JiaheShrimp/study_agent）
- [x] 工作/休息时长可配置（Tasks 页计时器按钮，TaskRunner 接收 workMins/restMins props）
- [x] 常规任务（紫色主题，连续打卡/目标天数/失败警告/数量上限）
- [x] 常规任务漏打结算（放假/没开 app 的日子不误判失败，下次打开逐天弹窗结算：请假桥接 / 中断计失败；已取代旧的补卡机制）
- [x] 常规任务 force_warning 修复（从创建日起算，创建当天不触发警告）
- [x] 常规任务 streak 重算（从 log 全量重算，保证补卡后一致性）
- [x] 历史任务回溯（Tasks 页月历切换日期，历史只读）
- [x] 有效学习时间统计（实际/计划两种口径，排除日 + 理由记录）
- [x] 爬坡学习目标（goal_state.json，达标递增/连续失败降级/连续天数统计）
- [x] Dashboard 精简（移除统计行和赢麻了速览，保留问候/倍数/目标卡/功能入口/时间轴）
- [x] 奖励点数系统（stars × 有效段数 × 多重加成系数 + 每日倍数，结果页展示得分明细）
- [x] Buff 系统数据结构（6 种模板，存 storage/buffs.py，系数随机生成）
- [x] 赏金任务重设计（内容从全历史 task_runs 随机抽取，每条携带 buff，随机弹出时间，0-2条/天）
- [x] 赏金任务弹窗优化（首次出现自动弹 + 音效，会话内不重复弹，弹窗尺寸放大）
- [x] 音效系统（Web Audio API 合成，老虎机/赢麻了/赏金弹出/按钮点击）
- [x] 时间轴显示暂停次数（`暂停 Xs · N次`）
- [x] 任务列表失败/中断显示完成百分比（`X% · 失败 · 可重试`）
- [x] AI 自主监管者基础设施（supervisor 统一入口 + 消息队列 + 右下角气泡轮询，目前仅接入赢麻了）
- [x] 可赢目标（赢麻了页面挂「未来可赢」带星级，赢一次累计连续/次数 + 按星级写当日记录，赢太多了归档进历史，winnables.json）
- [x] 保留任务（每日任务可勾「保留任务」跨天不消失，init 时迁移过往未完成的保留任务到今天，计算/显示/计时与普通任务一致）
- [x] 搭子聊天栏按天清零（GET /dialogue 只返回今天，全量历史保留后台；记忆 = 今天 16 条 + 更早随机抽样 6 条；业务数据全量喂 AI）

**待开发**：
- [ ] Buff 效果实际结算接入（task_score / daily_score / goal_shield / routine_double / lucky_dice）
- [ ] 日常任务 20% 概率随机 buff 抽取
- [ ] 积分展示页面（历史得分、buff 收集记录）
- [ ] 学习计划页面
- [ ] AI 趋势分析（Anthropic SDK）
- [ ] 历史回顾页面
- [ ] Electron 打包（功能稳定后）

### AI 自主成长伙伴「搭子」（全局聊天栏 + 对话记忆，目前仅接入赢麻了）

一个像**朋友/搭子**一样的 AI 角色（**不是监工、不说教、不喊口号**），以**全局唯一的聊天栏**呈现。两种来往：
- **业务操作触发**：你在赢麻了等页面操作，搭子异步生成主动反馈，出现在聊天栏。
- **主动聊天**：你在聊天栏打字，搭子带历史回复。

**核心：对话记忆**。两条路径共用同一条「对话历史」（`storage/ai_dialogue`，**全量跨天保留在后台文件**），它既是搭子的记忆，也是聊天栏内容的来源——每次生成都把对话（**含搭子自己说过的话**）拼进 prompt，所以它有连续感、且不会重复（看得见自己说过啥）。这和「桌面宠物每次单轮失忆」是本质区别。

**聊天栏按天清零（显示 ≠ 记忆）**：
- **显示**：`GET /ai/dialogue` 只返回**今天（游戏日，零点为界）**的对话（`ai_dialogue.today_turns()`）。每天打开聊天栏是干净的，过去的对话不呈现给用户——但**全部历史仍保留在 `ai_dialogue.json`**，只是不展示。
- **记忆**：搭子生成回复时拼的是 `ai_dialogue.memory_turns(today_limit=16, past_sample=6)`＝**今天最近 16 条 + 更早历史里随机抽样 6 条**。今天的保证连续感/防今日内重复；旧对话当学习语料让回复更人性化，是否提及过去交给随机、不强求。
- `recent_turns()` 保留作兼容旧调用；新逻辑走 `memory_turns()`。

#### 一次生成发给 AI 的 messages（`_history_messages`）

时间升序：
1. `user`：全部业务数据快照（`supervisor_context.build_summary()`，本地读零成本）+ `assistant` 一句确认（"我都看着呢"）
2. 记忆对话（`memory_turns`：今天最近 16 条 + 更早随机抽样 6 条，user/assistant 交替，搭子的历史回复也在内）
3. `user`：本次新输入 / 场景描述（`extra_user`）

#### 业务数据聚合（`supervisor_context.build_summary()`）

- 赢麻了：**最近 RECENT_KEEP=10 条固定 + 其余随机抽样**凑到 SAMPLE_BUDGET=40 条（每次抽样不同 → 逼 AI 均匀覆盖历史、减少老薅那几条的重复）；≤40 条时全给
- 专注：累计小时 + 每日趋势；常规习惯：当前/历史最长 streak + 累计打卡 + 今日状态

#### 防重复 = 读自己回复 + 随机抽样

- **读自己回复**：对话历史里有搭子说过的话，它不会再说一遍（"已经夸过论文框架了，换个说"）
- **随机抽样**：每次喂的"老记录"不同，覆盖更均匀

#### 统一入口 & 接入新触发点

`supervisor_react(trigger, context, *, force=False)` 是搭子的唯一业务入口：按 `TRIGGER_PROBABILITY` 概率命中 → 后台 daemon 线程异步生成 → 写入对话历史（不阻塞主请求，出错静默不影响主流程）。接入新触发点：

1. 在 `TRIGGER_PROBABILITY` 注册触发 id 和概率
2. 写一个**场景构造器** `_build_xxx_scene(context)`（只描述「这次发生了什么」，业务数据/历史由 `_history_messages` 统一注入，**不要自己拼数据**），登记到 `_PROMPT_BUILDERS`
3. 在 `FALLBACK_LINES` 加兜底文案（伙伴口吻，AI 超时/未配置时用）
4. 在对应 router 的业务函数里：先 `ai_dialogue.append_turn("user", "（操作描述）", trigger=...)` 写操作流水，再调 `supervisor_react("xxx", {...context})`

#### 角色人设

`SUPERVISOR_SYSTEM`：一个真正了解你这个人的**朋友/搭子**，真诚俏皮、为你高兴、偶尔损你；**明令禁止『加油』『好好学习』『快去写作业』这类说教/命令话**。每条限一句、≤40 字。`_generate` 用 `max_tokens=800`，AI 超时**自动重试一次**降低撞兜底概率。

> **max_tokens 为何是 800（重要）**：部分模型是「推理模型」（如 `deepseek-v4-pro`、o1 系列），返回里 `content`（正式回复）之外还有 `reasoning_content`（内部思考），两者共享 `max_tokens`。若上限太小（曾用 200），token 全被思考吃光、`content` 返回空字符串且 `finish_reason=length`，调用方误判失败 → 触发重试 → 白等一倍时间还常落到兜底。给足 800 后推理模型能正常出回复；普通模型用不满，无额外成本。注：耗时主要在模型本身（推理模型先思考，单次约 6~9 秒），数据聚合+prompt 构建仅约 12ms，不是瓶颈。

#### 接口

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/ai/dialogue?limit=N` | 聊天栏拉取对话历史 |
| POST | `/ai/chat` | 用户发消息：存 → 带历史生成回复 → 存 → 返回 |

业务触发的反馈无独立接口，直接写入对话历史，前端聊天栏轮询 `/ai/dialogue` 捕获。

#### 前端（聊天栏）

- `components/ChatSidebar.tsx`：全局唯一，挂在 `AppLayout` **左侧常驻**（导航栏之后、主内容之前；手机端为可收起浮层）。做成独立浮卡（四周 `p-3` 留白 + 圆角边框，与导航栏视觉分隔）。消息列表（user 右/assistant 左气泡）+ 输入框（Enter 发送、Shift+Enter 换行）+ 乐观插入用户消息。
- 布局高度锁定一屏（`AppLayout` 用 `h-screen` + `overflow-hidden`），聊天栏内部消息区滚动，不被长页面撑长。
- 每 **5s** 轮询 `/ai/dialogue`；另监听 `agent:dialogue-refresh` 全局事件（记赢麻了等操作派发），命中后在 1.5/3.5/6s 连刷几次，覆盖后台生成的几秒，无需干等下一轮。
- 检测到新 assistant 消息（对比最后 id）播 `playChatMessage()` 提示音（首次加载不播）。
- **「正在思考」动画**：发消息 / 收到 `agent:dialogue-refresh` 时显示三点跳动气泡（CSS `animate-typing-dot`，在 `index.css`），新反馈到达时收尾；30s 超时兜底自动关，防止反馈不来时一直转。

#### 触发点

| trigger | 概率 | 位置 / 说明 |
|---------|------|------|
| `win_created` | **1.0（必触发）** | `routers/wins.py` 记录赢麻了后。操作信息只作为 `context` 传给 AI 当背景，**不写进对话历史、不在聊天框显示成 user 气泡**（聊天框只出现搭子反馈） |
| `chat` | —（用户主动） | `POST /ai/chat` |

#### 待接入触发点（后续逐步实现）

- 任务完成 / 提前完成 / 力竭、常规打卡里程碑（`routers/tasks.py`）
- 每日首次打开
- 聊天栏里直接操作 agent（需 agent loop + 工具调用，暂未做）

#### 实现文件

- 后端：`routers/ai.py`（搭子核心 + dialogue/chat 接口）+ `storage/ai_dialogue.py`（对话历史/记忆）+ `supervisor_context.py`（业务数据聚合 + 随机抽样）+ `ai_client.chat_messages()`（多轮）+ `storage/tasks.py` 的 `load_task_runs()`
- 前端：`components/ChatSidebar.tsx`（聊天栏 + 思考动画）+ `AppLayout` 左侧挂载 + `api.ts` 的 `ai.dialogue / ai.chat` + `sounds.ts` 的 `playChatMessage()` + `index.css` 的 `animate-typing-dot` + `pages/Wins.tsx` 记录后派发 `agent:dialogue-refresh`

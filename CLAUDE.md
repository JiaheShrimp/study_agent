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
| AI SDK | Anthropic SDK | 待接入趋势分析 |
| 存储 | JSON 文件 | 后期可迁移 SQLite |
| 前端框架 | React 19 + Vite + TypeScript | |
| UI 组件 | shadcn/ui + Tailwind CSS v3 | 暖米白纸质感配色 |
| 图表 | Recharts | 分析页柱状图 |
| 路由 | react-router-dom v7 | |
| 字体 | Noto Sans SC + Inter | Google Fonts CDN |
| 桌面托盘 | pystray + Pillow | 托盘启动，无黑窗口 |
| 通知 | winotify | Windows 原生 Toast |

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
│   │   ├── tasks.py         # 任务系统 API（模板/当日/赏金/执行记录）
│   │   └── config.py        # 提醒配置 API
│   ├── storage/
│   │   ├── records.py       # wins.json 读写
│   │   ├── tasks.py         # 任务相关 JSON 读写
│   │   └── config.py        # config.json 读写
│   └── data/                # 所有 JSON 数据文件（不上传 git）
│       ├── wins.json
│       ├── config.json      # 包含 reminder 设置和 daily_bonus
│       ├── task_templates.json
│       ├── daily_tasks.json
│       ├── bounty_pool.json
│       ├── daily_bounties.json
│       └── task_runs.json   # 任务执行记录（含 started_at/ended_at）
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx          # 路由 + 老虎机逻辑（8点后触发）
│   │   ├── index.css        # 全局样式 + CSS 变量（暖米白配色）
│   │   ├── lib/
│   │   │   ├── api.ts       # 所有后端请求封装
│   │   │   └── utils.ts     # cn() 工具
│   │   ├── components/
│   │   │   ├── layout/      # AppLayout（含今日倍数条）, Sidebar, BottomNav
│   │   │   ├── ui/          # Button, Card, Dialog, Select
│   │   │   ├── SlotMachine.tsx   # 每日抽奖老虎机弹窗
│   │   │   ├── TaskRunner.tsx    # 任务追逐计时器（全屏）
│   │   │   └── DayTimeline.tsx   # 今日时间轴（Dashboard 展示）
│   │   └── pages/
│   │       ├── Dashboard.tsx     # 首页（统计 + 倍数卡 + 速览 + 时间轴）
│   │       ├── Wins.tsx          # 赢麻了（月历 + 记录 + 新增 + 分析抽屉）
│   │       ├── Tasks.tsx         # 每日任务（列表 + 快速添加 + 赏金弹窗）
│   │       ├── TasksManage.tsx   # 任务管理（模板库 + 赏金任务库）
│   │       └── Placeholder.tsx   # Plan 占位页
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
| 进步等级 | `win_level` | `small` / `medium` / `big` |
| 星星数 | `stars` | small=1, medium=2, big=3 |
| 每日倍数 | `daily_bonus` / `multiplier` | 1.0-3.0，三数平均映射 |
| 游戏日 | game date | 以每天 **08:00** 为起点，00-07:59 属于前一天 |
| 任务模板 | `task_template` | 每天自动复制到当日任务的模板 |
| 当日任务 | `daily_task` | 当天的具体任务实例，可编辑 |
| 赏金任务 | `bounty_task` | 每天随机抽取 0-3 个，可接受/跳过 |
| 任务执行 | `task_run` | 一次 TaskRunner 的完整执行记录 |
| 工作段 | work block | 30 分钟专注 + 5 分钟休息预算 |
| 休息预算 | rest budget | 暂停时消耗；耗尽则失败 |

---

## 游戏化机制

### 每日抽奖（已实现）
- 每天 **08:00 后**第一次打开自动弹出老虎机
- 三个滚轮各抽 1-5（权重递减），平均值映射到 1.0-3.0×
- 游戏日以 08:00 为界，跨午夜倍数不失效
- 当天倍数显示在全局顶部条 + Dashboard 卡片

### 赢麻了（已实现）
- **小赢** ★：做到了一件事
- **中赢** ★★：明显进步
- **特大赢** ★★★：重大突破
- 月历视图，点日期回顾；分析抽屉含柱状图 + 等级分布

### 每日任务（已实现）
- 任务模板库 → 每天自动复制为当日任务
- 快速添加：Enter / 空格 即保存，光标留在输入框
- 每条任务有：内容、预计时长(h)、重要程度(1-5 星)
- 赏金任务：随机弹出，可接受或跳过，带 buff 描述

### 任务追踪（已实现）
- hover 任务 → ▶ 开始 → 3-2-1 倒计时 → 全屏追逐跑道
- 🏃 向右冲刺，🐲 在后追赶
- 暂停时：🏃 停止，🐲 逼近，消耗休息预算
- 休息预算耗尽 → 失败（任务无效）；到达终点 → 完成 + 自动打勾
- 结果页记录：实际用时、暂停次数、总暂停时长

### 时间轴（已实现）
- Dashboard 底部展示今日任务时间轴
- 仅展示有执行记录的时间段，按 24 小时刻度
- 底部累计：仅统计完成任务的工作时长（不含暂停/休息）

### 每日提醒（已实现）
- 托盘程序后台每 30 秒检查提醒时间
- Windows Toast 通知，点击直接打开应用
- 在赢麻了页面「提醒」按钮中设置，支持多个时间点

### 待开发
- [ ] 学习计划模块
- [ ] AI 趋势分析（Anthropic SDK，分析赢麻了记录 + 任务完成情况）
- [ ] 积分/经验值系统（倍数 × 重要程度 × 完成率）
- [ ] 历史回顾页面

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
- **老虎机容错**：后端未就绪时前端仍然弹出（catch 触发），用户可跳过
- **任务执行记录**：`started_at` 在倒计时结束（phase='running'）时记录，非点击时

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
- [x] 每日抽奖老虎机（滚轮动画 + 倍数计算 + 08:00 游戏日边界）
- [x] 赢麻了模块（月历 + 记录 + 快速添加 + 删除 + 分析抽屉）
- [x] 每日任务模块（模板库 + 当日任务 + 赏金任务 + 管理页）
- [x] 任务追踪器（3-2-1 倒计时 + 追逐跑道 + 暂停/失败/完成 + 结果页）
- [x] 每日时间轴（Dashboard 展示执行记录，累计专注时长）
- [x] 每日提醒（托盘 + winotify Toast 通知）
- [x] 托盘启动器（app.py + 启动.vbs，无黑窗口）
- [x] GitHub 仓库（https://github.com/JiaheShrimp/study_agent）

**进行中**：
- [ ] 时间轴在 Dashboard 的验证（verify 待完成）

**待开发**：
- [ ] 学习计划页面
- [ ] AI 趋势分析（Anthropic SDK）
- [ ] 积分/等级系统
- [ ] 历史回顾页面
- [ ] Electron 打包（功能稳定后）

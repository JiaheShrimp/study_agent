# Agent 项目指南

本文档是 Claude Code 的工作规范，每次对话都会自动加载。所有代码风格、架构决策、命名约定以此为准。

---

## 项目简介

<!-- 用一段话描述这个游戏化学习 agent 是什么、解决什么问题、目标用户是谁 -->

---

## 技术栈

| 层级 | 选型 | 备注 |
|------|------|------|
| 后端语言 | Python 3.12 | |
| 后端框架 | FastAPI + uvicorn | REST API |
| AI SDK | Anthropic SDK | 后期接入趋势分析 |
| 存储 | JSON 文件 | 够用，后期可迁移至 SQLite |
| 前端框架 | React 19 + Vite + TypeScript | |
| UI 组件 | shadcn/ui + Tailwind CSS | 简约现代风 |
| 图表 | Recharts | 分析页柱状图 |
| 路由 | react-router-dom v7 | |

---

## 项目结构

```
agent/
├── backend/
│   ├── main.py              # FastAPI 入口，uvicorn 启动
│   ├── routers/
│   │   └── wins.py          # 赢麻了相关 API
│   ├── storage/
│   │   └── records.py       # JSON 读写封装
│   └── data/
│       └── wins.json        # 持久化数据
├── frontend/
│   ├── src/
│   │   ├── main.tsx         # React 入口
│   │   ├── App.tsx          # 路由定义
│   │   ├── index.css        # 全局样式 + CSS 变量
│   │   ├── lib/
│   │   │   ├── api.ts       # 后端请求封装
│   │   │   └── utils.ts     # cn() 工具
│   │   ├── components/
│   │   │   ├── layout/      # AppLayout, Sidebar, BottomNav
│   │   │   └── ui/          # Button, Card, Dialog, Select
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Wins.tsx     # 赢麻了页面
│   │       └── Placeholder.tsx
│   ├── package.json
│   └── vite.config.ts       # /api -> localhost:8000 代理
└── CLAUDE.md
```

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

访问 http://localhost:5173

---

## 核心概念与命名约定

> 统一业务概念在代码中的命名，避免同一概念出现多种叫法。

| 业务概念 | 代码命名 | 说明 |
|----------|----------|------|
| 今日进步记录 | `win` | 单条记录 |
| 进步等级 | `win_level` | `small` / `medium` / `big` |
| 星星数 | `stars` | small=⭐, medium=⭐⭐, big=⭐⭐⭐ |
| 所有记录 | `wins` | win 的列表 |
| 每日汇总 | `daily_summary` | 按日期分组后的视图 |

---

## 架构设计

### Agent 结构

<!-- 描述 agent 的职责划分。例如：
- PlannerAgent：根据用户目标制定学习计划
- TutorAgent：执行具体的教学对话
- EvaluatorAgent：评估用户回答、发放经验值
-->

### 核心循环

<!-- 描述主交互流程，例如：
1. 用户输入学习目标
2. PlannerAgent 分解为若干任务
3. 用户逐步完成任务，TutorAgent 辅助
4. EvaluatorAgent 评分并更新进度
-->

### 数据流

<!-- 描述数据如何在 agent、工具、数据库之间流转 -->

---

## 代码风格规范

- 注释语言：中文
- 函数命名：`snake_case`
- 类命名：`PascalCase`
- 异步：同步优先，引入 AI 调用时再切换 async
- 类型注解：必须（所有函数参数和返回值）
- 数据读写：feature 层不直接操作文件，必须通过 `storage/` 层

---

## 游戏化机制

### 赢麻了（已实现）
- **小赢** ⭐：小进步，做到了一件事
- **中赢** ⭐⭐：明显进步，值得记一笔
- **特大赢** ⭐⭐⭐：重大突破，值得庆祝

### 待规划
<!-- 后期根据积累的记录，由 AI 分析趋势、制定方向 -->

---

## 开发规范

### 新增功能流程

<!-- 例：
1. 在此文档的"核心概念"中先定义新概念的命名
2. 更新项目结构
3. 实现代码
-->

### 禁止事项

<!-- 例：
- 禁止在 prompt 中硬编码用户数据
- 禁止跳过类型注解
-->

---

## 当前开发阶段

<!-- 记录现在在做什么、下一步计划，帮助跨会话保持上下文 -->

**当前阶段**：MVP 搭建

**已完成**：
- [x] CLAUDE.md 规范文档

**已完成**：
- [x] 赢麻了 CLI（输入 + 选星级 + JSON 存储）
- [x] FastAPI 后端重构（routers/wins.py，5 个接口）
- [x] React 前端脚手架（Vite + TS + Tailwind + shadcn/ui）
- [x] 响应式布局（桌面左侧边栏 + 手机底部导航）
- [x] 首页 Dashboard（统计卡片 + 今日速览 + 功能入口）
- [x] 赢麻了页面（月历 + 日记录 + 新增弹窗 + 分析抽屉）

**进行中**：

**待规划**：
- [ ] 回顾模式：查看历史记录
- [ ] AI 趋势分析：分析过去记录，制定目标方向

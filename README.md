# Study Agent

一个游戏化的学习进度追踪工具。记录每天的进步，用星级量化成就感。

## 功能

- 🎉 **赢麻了** — 记录每日进步，分小赢 / 中赢 / 特大赢三个等级
- 📅 月历视图，点击任意日期回顾当天记录
- 📊 数据分析，统计星数趋势和等级分布
- （更多功能开发中…）

## 环境要求

- Python 3.11+
- Node.js 18+

## 安装与启动

**1. 克隆仓库**

```bash
git clone https://github.com/JiaheShrimp/study_agent.git
cd study_agent
```

**2. 启动后端**

```bash
cd backend
pip install fastapi uvicorn
python -m uvicorn main:app --reload
```

**3. 启动前端**（新开一个终端）

```bash
cd frontend
npm install
npm run dev
```

**4. 打开浏览器访问** `http://localhost:5173`

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python · FastAPI · uvicorn |
| 前端 | React 19 · Vite · TypeScript · Tailwind CSS |
| 存储 | JSON 文件 |

# Agent Project Notes

这个文件是给后续维护用的短版项目手册。不要写成完整产品说明书，只保留会影响开发判断的约定、入口和当前实现状态。

## 项目定位

游戏化个人成长 Agent。核心循环是：每天抽老虎机倍数，记录「赢麻了」，完成每日/保留/赏金/常规任务，获得分数和可兑现 buff。全局 AI「搭子」能看到后台数据，像朋友一样聊天和反馈操作。

## 技术栈

- 后端：Python + FastAPI + JSON 文件存储。
- 前端：React + Vite + TypeScript + Tailwind。
- AI：`backend/ai_client.py`，走配置里的 provider/model/key，支持普通聊天和 OpenAI-compatible tools。
- 后端入口：`backend/main.py`。
- 前端入口：`frontend/src/App.tsx`。
- API 封装：`frontend/src/lib/api.ts`。

## 启动

后端：

```bash
cd backend
python -m uvicorn main:app --reload
```

前端：

```bash
cd frontend
npm run dev
```

访问 `http://localhost:5173`。

## 数据文件

数据基本都在 `backend/data/`，不应提交到 git。

- `ai_dialogue.json`：聊天栏历史和业务触发反馈。
- `buff_rewards.json`：任务完成后获得的 buff 奖励记录。
- `config.json`：AI 配置、每日老虎机结果等。
- `daily_tasks.json` / `task_runs.json` / `routines.json`：任务与执行记录。
- `wins.json` / `winnables.json`：赢麻了和未来可赢。

## 模块地图

后端：

- `backend/routers/ai.py`：AI 搭子、聊天、业务触发反馈、工具调用。
- `backend/supervisor_context.py`：给 AI 的后台数据摘要。
- `backend/supervisor_stats.py`：Python 预先算好的结构化数据事实。
- `backend/routers/tasks.py`：任务系统主逻辑。
- `backend/routers/bonus.py`：每日老虎机倍数，包含次日骰子 buff 消费。
- `backend/storage/buffs.py`：buff 模板池。
- `backend/storage/buff_effects.py`：buff 兑现逻辑。

前端：

- `frontend/src/components/ChatSidebar.tsx`：全局聊天栏。
- `frontend/src/components/SlotMachine.tsx`：每日老虎机和 buff 结算展示。
- `frontend/src/pages/Tasks.tsx`：任务页。
- `frontend/src/pages/Wins.tsx`：赢麻了页。
- `frontend/src/components/BountyPopup.tsx`：全局赏金弹窗。

## AI 搭子

目标：个性化、拟人化，不要模板回复。

当前原则：

- 聊天框输入就是普通聊天，不是任务事件。
- 后台数据只是 AI 的记忆，只有自然相关时才提。
- 业务触发反馈只描述当前事件，结合后台数据生成一句话。
- AI 调用失败时显示 `AI 调用失败，请稍后再试。`，不再用假兜底句冒充 AI。
- 不靠坏句黑名单解决模板味，优先从 prompt 输入结构处理。

关键实现：

- `SUPERVISOR_SYSTEM` 在 `backend/routers/ai.py`。
- `_history_messages()` 注入完整业务摘要。
- 最近聊天只作为上下文说明注入，不把旧 assistant 回复当作风格样本。
- 业务触发反馈调用 `_generate(..., include_dialogue=False)`，避免历史回复污染新回复。
- `_data_steer()` 低概率提醒 AI 参考数据事实，不要求硬报数字。
- `supervisor_stats.py` 输出 `type/scope/metric/unit/meaning` 形式的事实卡，减少 AI 混淆指标。

触发器：

- `win_created`：记录赢麻了后必回。
- `task_completed`：任务完成后必回。
- `task_aborted`：中断/失败按概率和冷却。
- `task_created`：新增任务后必回。
- `task_deleted`：删除任务低概率反馈。
- `idle`：后台随机主动冒泡。

新增业务反馈时，在 `TRIGGERS` 加 scene，然后在业务代码里调用 `supervisor_react(...)` 或 `emit_task_event(...)`。

## 聊天工具调用

聊天里可以让 AI 操作 agent，例如派发任务。

- `backend/ai_tools.py`：工具注册表。
- `routers/ai.py::_chat_react()`：聊天处理入口。
- `ai_client.chat_with_tools()`：OpenAI-compatible function calling。

注意：deepseek-v4-pro 这类 thinking model 对强制 tool_choice 不稳定，所以保留 JSON 提取路径。新增工具优先在 `ai_tools.py` 里加 handler、schema、intent keywords，不要把分发逻辑写散。

## Buff

buff 已抽成可扩展结构，但只有能真实兑现的 buff 才能进随机池。

当前已兑现：

- `score_bonus`：完成任务后的额外奖励分。
- `lucky_dice`：今天完成任务获得，第二天老虎机结算时让每个骰子在正常结果基础上 +1，上限 5。

关键规则：

- 赏金任务 buff 100% 给。
- 常规/普通类任务可以概率触发 buff。
- 未实现兑现逻辑的 buff 不应进入随机池。
- 新 buff 必须先实现参数和结算接口，再加入随机池。

关键文件：

- `backend/storage/buffs.py`：模板和随机池。
- `backend/storage/buff_effects.py`：实际兑现。
- `backend/storage/buff_rewards.py`：获得记录。

## 幸运骰子结算

当前设计：老虎机先正常摇出三个骰子，再在结算阶段叠加 buff。

后端：

- `GET /bonus/pending-dice-buffs`：返回今天待生效的骰子 buff。
- `POST /bonus/today`：保存每日结果时消费 lucky dice，并返回最终 rolls/multiplier/buff 明细。

前端：

- `App.tsx` 在没有今日 bonus 时先拉 pending dice buffs，再打开老虎机。
- `SlotMachine.tsx` 正常播放一次动画，不播放叠加动画。
- 结果区展示正常结果和 buff 叠加后的最终结果。

## 任务和得分

- 每日任务、保留任务、赏金任务、常规任务都走统一任务事件反馈。
- 完成任务会写 `task_run`，并根据实际规则计算分数。
- 常规任务是长期挂在页面的习惯任务，完成后才可能揭露 buff。
- 赏金任务天然带 buff，并且 buff 在接受/完成流程里展示和兑现。

## 开发约定

- 不要把 `backend/data/` 的用户数据提交。
- 不要把 AI 历史回复当作 prompt 风格样本反复喂回去。
- 需要精确数字时让 Python 算，AI 只负责表达。
- AI prompt 不要靠不断补丁式禁止事项堆砌，优先规范输入数据结构。
- 新 buff 必须先实现兑现逻辑，再加入随机池。
- UI 改动优先沿用现有组件和布局，不做大面积重设计。

改完后至少跑：

```bash
python -c "import sys; sys.path.insert(0,'backend'); import routers.ai; print('ai import ok')"
python -c "import ast, pathlib; ast.parse(pathlib.Path('backend/routers/ai.py').read_text(encoding='utf-8')); print('ai ast ok')"
cd frontend
npm run build
```

## 当前待办

- 给更多 buff 类型补兑现逻辑后再开放随机池。
- 做 buff 历史/收集展示。
- 继续观察 AI 回复质量，重点看是否个性化、是否混淆数据口径。
- 后续可扩展更多聊天工具，例如调整目标、发 buff、生成计划。

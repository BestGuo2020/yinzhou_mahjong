# AGENTS.md

颍州扎杠麻将使用 Vue 3 和 Three.js，由一名玩家与三名本地 AI 对局。当前入口使用 `src/game/variants/yingzhou/`，每场按 4／8／16 个有效局推进。玩法依据 `docs/颍州扎杠麻将完整规则.md` 和 `docs/颍州扎杠麻将新手规则.md`。

本地 AI、LLM、训练评测、分析回放和它们依赖的旧玩法引擎必须保留；不能按 `lotus`、`bloodFlow` 等目录名批量删除。现有联机底层代码（WebSocket）也保留，等待幺筒适配。下方上游名称约束继续适用于保留模块。

项目名称中的“莲花”指地方、县城及当地麻将玩法来源，不表示花卉，也不是视觉母题。

必须遵守：

- “莲花广麻”“莲花麻将”只用于玩法、规则、规则说明和相关业务标识。
- 不从“莲花”二字推导项目 Logo、页面样式、主题、桌布、牌墙、牌背、牌河、皮肤、粒子、徽章、动作字或结算表现。
- 不新增莲花、荷花、荷叶、花瓣、莲花奖牌、莲花印章、莲花绽放等项目级视觉符号。
- 不构造“莲华首席”“莲花数据城”等由名称派生的世界观。
- 不因玩法名称推导岭南、粤式茶楼或其他未经产品决策确认的地域视觉。
- 五个主题的视觉来源必须是各自的主题概念，不能来自“莲花”地名。

## 分支

仓库只有 `master` 一条长期分支。历史文档中出现的 `vibehub` 分支、`pnpm sync:vibehub`、`scripts/*-vibehub*`、`$vibehubKeep` / `$masterOnly` 清单均为已废弃的历史记录，不要执行或重建；UI、规则与联机改动直接在 `master` 提交。

## 后端仓库

`backend/` 是**独立的 git 仓库**（`D:/PycharmProjects/linahua-mahjong-backend` 主仓库的 linked worktree，前端仓库的 .gitignore 忽略了它）。修改后端代码后，需在 `backend/` 目录内单独 `git commit`（后端自己的 main 分支），与前端分支互不影响。

## 测试

- 前端：`pnpm test`（vitest，`src` 下）
- 后端：`backend/.venv/Scripts/python.exe -m pytest tests -q`（在 `backend/` 目录内）

## 长任务轮询（避免触发上游循环拦截）

dsh 通过阿里云百炼 Qwen Token Plan 网关（`qwen-token-plan-cn`）访问模型，该网关**在服务端**检测「同一 tool call（同名 + 同参数）在多轮里重复」，命中即整轮拒绝：`Repetitive tool calls detected in the conversation history...`（dsh 只把它透传为 `PI_AI_ERROR`）。由于重复调用已经留在会话历史里，**之后每个请求都会被拒**——补发新消息、让模型换参数、压缩历史都救不回来，会话说死。

**必须遵守（长时间训练/评测监控时尤其重要）：**

1. 任何等待/轮询类命令（sleep + 查状态）**每次都必须唯一**：命令里带一行注释 `# poll <序号/总数> <时间戳>`，并让 description 也带序号；**禁止发出与历史逐字相同的命令**（command、description、timeoutMs 全都一致才算重复）。
2. 同一模式的轮询在**一个会话里最多出现 2 次**；第 3 次必须换策略：换命令形态、换检查内容，或改用 job 通知机制。
3. 等长任务结束优先用 dsh 的 job/通知机制（job 完成会主动通知），不要用 sleep 轮询空等；必须 sleep 时单轮 ≤10 分钟，且第 1 条仍然适用。
4. 一旦看到 `Repetitive tool calls detected`：**不要在该会话里重试**（重试必然同样失败）。停下该会话，改开新会话接手，或先修复会话日志再继续（修复脚本与流程见 `~/.dsh/_dedup_loop_calls.mjs`）。

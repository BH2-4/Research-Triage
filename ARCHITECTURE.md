# 人人都能做科研 — Phase 1-3 整合架构

> 本文档描述当前真实代码架构。Phase 4 继续基于本架构扩展，不恢复旧表单式 `/api/triage` 管线。

## 1. 架构目标

MVP 只验证一个核心闭环：

```text
用户输入模糊想法
  -> 画像识别
  -> 模糊点暴露与确认
  -> 生成科研探索 Plan
  -> 用户挑战/调整 Plan
  -> 产物写入 userspace 并可预览
```

系统不是普通聊天机器人。它的核心价值是“科研任务入口层 + AI 编排层 + 文档沉淀层”。

## 2. 技术选型

| 层 | 当前选型 | 说明 |
|---|---|---|
| Web 框架 | Next.js 16 App Router | 单页工作台 + Route Handlers |
| 语言 | TypeScript | 前后端共享类型 |
| UI | React 19 | 客户端状态使用 `useState` + `sessionStorage` |
| AI Provider | 裸 `fetch` 调 OpenAI-compatible API | 避免 SDK 兼容问题 |
| Prompt/Skill | `skills/*.md` + `/api/chat` 阶段指令 | Phase 4 可继续拆为 agent 模块 |
| 存储 | 内存 Map + `userspace/` 磁盘文件 | MVP 足够，后续可替换为 DB/Object Storage |
| Markdown | `marked` | Plan/文档预览 |
| 测试 | Vitest + TypeScript build | 当前覆盖规则 fallback 基础模块 |

## 3. 前端结构

```text
ChatPage (/)
  ChatPanel
    ChatMessage
    ChoiceButtons
    InlineInput
  ChatInput
  SidePanel
    ProfileCard 内联
    PlanPanel
    FileList
    DocPanel
```

当前只有 `/` 是产品主入口。

兼容路由：

```text
/intake      -> redirect("/")
/result      -> redirect("/")
/route-plan  -> redirect("/")
```

这些兼容路由只用于避免历史链接失效，不承载旧业务流程。

## 4. 后端 API

当前仅保留三个运行时 API：

```text
POST /api/chat
GET  /api/userspace/{sessionId}
GET  /api/userspace/{sessionId}/{filename}
```

### 4.1 `/api/chat`

职责：

- 维护会话阶段。
- 读取和更新用户画像。
- 注入 `skills/*.md`。
- 调用 AI provider。
- 解析 AI JSON 输出。
- 生成或调整 Plan。
- 写入 `userspace/`。
- 在 AI 调用失败时返回规则 fallback。

阶段机：

```text
greeting
  -> profiling
  -> clarifying
  -> planning
  -> reviewing
```

阶段含义：

| 阶段 | 目标 | 允许产物 |
|---|---|---|
| greeting | 首次引导 | `reply`, `questions` |
| profiling | 提取画像字段 | `profile`, `profileConfidence`, `questions` |
| clarifying | Plan 前置检查 | 假设确认、追问选项 |
| planning | 生成 Plan | `plan-v{n}.md` |
| reviewing | 根据用户反馈调整 Plan | 新版本 `plan-v{n}.md` |

### 4.2 `/api/userspace/{sessionId}`

返回 `manifest.json` 中的文件清单。

### 4.3 `/api/userspace/{sessionId}/{filename}`

返回指定文件内容。`userspace.ts` 会校验 `sessionId` 和 `filename`，避免路径穿越。

## 5. 数据模型

核心类型位于 `src/lib/triage-types.ts`。

### 5.1 `UserProfileState`

用户画像 10 字段：

```text
ageOrGeneration
educationLevel
toolAbility
aiFamiliarity
researchFamiliarity
interestArea
currentBlocker
deviceAvailable
timeAvailable
explanationPreference
```

服务端内部使用 `UserProfileMemory` 保存：

```text
value
confidence
source
updatedAt
```

画像就绪规则：

```text
confidence >= 0.7 的字段数量 >= 6
```

### 5.2 `PlanState`

Plan 必须包含：

```text
userProfile
problemJudgment
systemLogic
recommendedPath
actionSteps
riskWarnings
nextOptions
version
isCurrent
modifiedReason?
```

Plan 每次生成或调整都会写成 `plan-v{version}.md`。

## 6. userspace 文件系统

```text
userspace/{sessionId}/
  manifest.json
  profile.md
  plan-v1.md
  plan-v2.md
```

规则：

- `profile.md` 在画像有信号时写入。
- `plan-v{n}.md` 在 planning/reviewing 阶段写入。
- 旧 Plan 不删除，manifest 保留版本元数据。
- 服务重启后可从 `profile.md` 和最新 Plan 文件恢复基础状态。

## 7. AI 输出稳定性

系统对 AI 输出做了以下防护：

- JSON 提取支持纯 JSON、代码块 JSON、正文中 JSON。
- Plan 字段支持多种命名风格归一化。
- actionSteps/riskWarnings 支持字符串和对象格式。
- planning/reviewing 输出统一要求 JSON，避免“有时 markdown、有时 JSON”的协议漂移。
- AI 调用失败时返回 `_fallback: true` 和规则选项，不让主流程直接崩溃。
- userspace API 校验路径片段，避免非法文件访问。

Phase 4 应补充自动化契约测试覆盖这些防护。

## 8. 已清理的旧框架

以下旧表单式流程已经删除：

```text
src/app/api/triage/**
src/app/api/generate-answer/route.ts
src/app/api/recommend-service/route.ts
src/components/intake-form.tsx
src/components/result-view.tsx
src/components/route-plan-view.tsx
src/components/plan-card.tsx
src/lib/ai-triage.ts
src/lib/route-plan.ts
src/lib/storage.ts
```

保留项：

```text
src/lib/triage.ts
src/lib/triage.test.ts
```

保留原因：规则分诊逻辑可作为 Phase 4 AI 失败 fallback 的基础模块，且已有测试覆盖。

## 9. Phase 4 扩展位

建议按以下方向扩展：

- 把 `/api/chat/route.ts` 中的阶段 prompt 拆到 `src/lib/chat-prompts.ts` 或 `prompt_templates/chat/*.md`。
- 把 Plan 生成和 Review 调整拆成 `src/lib/chat-pipeline.ts`，让 route handler 只负责编排。
- 增加 `summary.md`、`action-checklist.md`、`research-path.md` 文档生成。
- 增加 Plan 历史版本对比视图。
- 增加契约测试：AI 非 JSON、字段缺失、Plan 版本递增、userspace 路径校验、fallback。
- 将内存 Map 替换为持久会话存储，以支持 Vercel/多实例部署。

## 10. 当前边界

MVP 当前不做：

- 用户登录。
- 多设备同步。
- 文件上传。
- 真实学生实验数据采集。
- 自动生成完整论文。
- 后台人工审核系统。

这些能力都可以在 Phase 4 之后以模块方式加入，不能破坏当前 `/api/chat + userspace + 单页工作台` 主链路。

# 人人都能做科研 — Phase 1-4 整合架构

> 本文档描述当前真实代码架构。Phase 4 已基于原主链路完成扩展，不恢复旧表单式 `/api/triage` 管线。

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
| Prompt/Skill | `skills/*.md` + `src/lib/chat-prompts.ts` | 阶段 prompt 独立，route handler 只做编排 |
| 存储 | 内存 Map + `userspace/` 磁盘文件 | MVP 足够，后续可替换为 DB/Object Storage |
| Markdown | `marked` | Plan/文档预览 |
| 测试 | Vitest + TypeScript build | 覆盖规则 fallback、userspace、chat 协议解析 |

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
    PlanHistoryPanel
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

当前仅保留主对话和 userspace 两类运行时 API：

```text
POST /api/chat
GET  /api/userspace/{sessionId}
GET  /api/userspace/{sessionId}/{filename}
POST /api/userspace/{sessionId}/{filename}?action=open
```

### 4.1 `/api/chat`

职责：

- 维护会话阶段。
- 读取和更新用户画像。
- 注入 `skills/*.md`。
- 调用 AI provider。
- 解析 AI JSON 输出。
- 生成或调整 Plan。
- 写入 `userspace/`，同步生成摘要、行动清单、科研路径文档；需要代码或 Demo 时同步生成独立代码文件。
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
| planning | 生成 Plan | `plan-v{n}.md`, `summary.md`, `action-checklist.md`, `research-path.md`，必要时生成 `code-v{n}-*` |
| reviewing | 根据用户反馈调整 Plan | 新版本 `plan-v{n}.md`，并刷新配套文档和必要代码文件 |

### 4.2 `/api/userspace/{sessionId}`

返回 `manifest.json` 中的文件清单。

### 4.3 `/api/userspace/{sessionId}/{filename}`

返回指定文件内容。`?raw=1` 返回原始文本，供浏览器直接打开或下载。

同一路由支持 `POST ?action=open`，在本地开发环境中通过系统默认应用打开文件。该能力仍复用 `userspace.ts` 的路径校验，不新增业务管线。

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
  summary.md
  action-checklist.md
  research-path.md
  code-v2-demo.py
```

规则：

- `profile.md` 在画像有信号时写入。
- `plan-v{n}.md` 在 planning/reviewing 阶段写入。
- `summary.md`、`action-checklist.md`、`research-path.md` 随当前 Plan 刷新，manifest 保留其类型和版本。
- `code-v{n}-*` 仅在 Plan 协议返回 `codeFiles` 时生成，manifest 记录 `type: "code"` 和 `language`，供右侧面板预览、原文打开、下载或系统默认应用打开。
- 旧 Plan 不删除，manifest 保留版本元数据。
- 服务重启后可从 `profile.md` 和最新 Plan 文件恢复基础状态。

## 7. AI 输出稳定性

系统对 AI 输出做了以下防护：

- JSON 提取支持纯 JSON、代码块 JSON、正文中 JSON。
- JSON 提取支持模型在协议 JSON 前后夹杂说明文本，并优先提取包含 `reply/questions/plan/codeFiles` 的协议对象。
- Plan 字段支持多种命名风格归一化。
- actionSteps/riskWarnings 支持字符串和对象格式。
- planning/reviewing 输出统一要求 JSON；若解析失败，会重试一次并禁止把协议 JSON 原文泄漏到聊天气泡。
- AI 调用失败时返回 `_fallback: true` 和规则选项，不让主流程直接崩溃。
- userspace API 校验路径片段，避免非法文件访问。

自动化契约测试覆盖这些防护。

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

## 9. Phase 4 已完成扩展

当前已完成：

- 阶段 prompt 拆到 `src/lib/chat-prompts.ts`。
- Plan 解析、归一化、持久化和流程摘要拆到 `src/lib/chat-pipeline.ts`。
- 增加 `summary.md`、`action-checklist.md`、`research-path.md` 文档生成。
- 增加代码文件产物生成：任务需要代码、脚本、配置或 Demo 时，AI 通过 `codeFiles` 协议输出独立文件，服务端写入 userspace。
- 增加 Plan 历史版本对比视图。
- 增加契约测试：AI 非 JSON、混入说明文本的 JSON、Plan 字段归一化、userspace 路径校验、文档产物写入、代码产物写入。

后续仍可扩展：

- 将服务端内存 Map 替换为持久会话存储，以支持 Vercel/多实例部署。
- 增加更强的人工审核记录和 Plan 质量评分。
- 增加图片/图示产物，但不得破坏当前 `/api/chat + userspace + 单页工作台` 主链路。

## 10. PRD V1.1 §8 模块实现度检查

本节对照 `人人都能做科研_mvp_prd_审查版 V1.1.md` 的第 8 节功能需求。当前判断：P0 主链路已经完成，P1 需要在现有预留扩展点上继续演进，不重建架构。

### 10.1 P0 模块实现程度

| PRD 模块 | 优先级 | 当前实现 | 实现程度 | 说明 |
|---|---|---|---|---|
| 8.2 对话入口 | P0 | `src/app/page.tsx`, `ChatPanel`, `ChatInput` | 已完成 | 用户进入 `/` 后直接进入单页工作台，支持自然语言输入，不再使用旧表单流程。 |
| 8.3 用户画像识别 | P0 | `memory.ts`, `/api/chat`, `side-panel.tsx` | 已完成，可增强 | 10 字段画像、置信度、画像就绪规则、前端画像展示均已存在；用户纠正目前通过自然语言回写，没有独立修正入口。 |
| 8.4 多轮博弈引导 | P0 | 阶段机、`questions`, `ChoiceButtons`, `InlineInput` | P0 已完成，V1.1 多选待做 | 已支持主动追问、选项按钮、自由输入、Plan 调整；多选按钮属于 V1.1 P1 增量。 |
| 8.5 Plan 生成与展示 | P0 | `PlanState`, `PlanPanel`, `chat-pipeline.ts` | 已完成 | Plan 有独立区域、折叠分区、步骤级调整按钮、版本号和 userspace 持久化。 |
| 8.6 文档预览面板 | P0 | `FileList`, `DocPanel`, `/api/userspace` | 已完成，可增强 | Markdown 文档、代码文件、摘要、清单、科研路径可预览；修改项/删减项目前主要依赖 Plan 历史，不是专门 diff 视图。 |
| 8.1 多端适配 | P0 | `globals.css` 响应式布局 | 基础完成 | 工作台在桌面/移动端可用，后续 P1 交互增强需要继续做移动端状态验证。 |

### 10.2 P1 模块实现基础

| PRD 模块 | 当前状态 | 已有预留 | Phase 5 落地 |
|---|---|---|---|
| 多级选择 / 拆分选项 | 已完成 | `normalizeQuestions`, `splitInlineSubOptions`, `ChoiceButtons`, `InlineInput` | 新增 `ChoiceGroup` 协议、单选/多选组件、已选状态、确认选择和旧 `questions` 兼容。 |
| 图片 / 文档展示 | 已完成 | `marked` 富文本渲染、`FileManifest.type = "image"`、`DocPanel` | 新增统一 Markdown 渲染、图片样式、失败兜底、外部图片元数据和 userspace 图片 manifest。 |
| Memory 机制 | 已完成 | `UserProfileMemory`, `profile.md`, session store, userspace 恢复 | 新增 `state.json`、`progress/preference/promptState`、服务恢复和显式画像修正入口。 |
| Skill / Prompt 动态引导 | 已完成 | `skills/*.md`, `skills.ts`, `chat-prompts.ts`, 阶段 instruction | 新增 `selectSkills()`，按画像/阶段裁剪 skill 注入，并持久化 prompt state。 |
| Multi-Agent 工作流 | 未开始 | 当前单 Agent 编排层可继续承载模拟角色 | 保持 P2，不在 P1 引入真实多 Agent/MCP。 |

## 11. P1 扩展架构

P1 的架构原则是保持主链路不变：

```text
单页工作台
  -> /api/chat
  -> Memory / Prompt / Pipeline
  -> userspace 文件沉淀
  -> 右侧 Plan / Doc / History 预览
```

不得恢复旧 `/api/triage` 表单式管线，不新增第二套对话 API，不绕过 userspace 做产物沉淀。P1 只利用 Phase 1-4 留下的冗余点做增量扩展。

### 11.1 交互协议扩展

当前响应协议：

```ts
{
  reply: string;
  questions?: string[];
  profile?: UserProfileState;
  profileConfidence?: Record<string, number>;
  phase: Phase;
  plan?: PlanState;
}
```

P1 可向后兼容增加结构化选择协议：

```ts
type ChoiceMode = "single" | "multiple";

type ChoiceGroup = {
  id: string;
  mode: ChoiceMode;
  prompt?: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
    selected?: boolean;
  }>;
  confirmLabel?: string;
};
```

兼容规则：

- `questions: string[]` 继续保留，作为旧模型输出和 fallback 的单选渲染路径。
- `/api/chat` 负责把 AI 输出中的 `choiceGroups` 归一化；如果没有 `choiceGroups`，继续按 `questions` 渲染。
- 前端在 `ChoiceButtons` 内部升级为单选/多选组件，不改变 `ChatPanel` 和 `/api/chat` 的基本调用方向。
- 多选确认后发送一条自然语言摘要，例如：`我选择了：A、B、C`，继续复用现有 `sendMessage`。

### 11.2 图片与文档扩展

当前 userspace 已允许 manifest 类型包含 `image`，但缺少完整图片产物协议。P1 应沿着 userspace 增加图片元数据，而不是引入独立媒体系统。

建议新增：

```ts
type ImageArtifact = {
  filename?: string;
  url?: string;
  title: string;
  source?: string;
  caption?: string;
  alt?: string;
  version: number;
};
```

实现边界：

- Markdown 中的 `![]()` 必须在 `DocPanel` 和聊天气泡中正常渲染，图片宽度受容器约束。
- 外部图片优先保存为元数据引用，不默认下载远程资源。
- 如果后续支持上传图片，仍写入 `userspace/{sessionId}/` 并记录 manifest，不新增独立上传业务管线。
- 对外部 HTML/图片内容必须补安全策略，避免把不可信 HTML 直接暴露给用户。

### 11.3 Memory 扩展

现有 `UserProfileMemory` 只覆盖画像字段。P1 可以在同一 session state 中增加：

```text
progress.memory      当前阶段、最近确认项、当前 Plan 版本
preference.memory    解释偏好、按钮偏好、输出长短偏好
prompt.state         当前启用的 skill/prompt 策略
```

持久化策略：

- MVP 阶段继续使用内存 Map + userspace 文件。
- `profile.md` 保持给用户可读。
- 新增机器可读 JSON 时优先放在 `userspace/{sessionId}/state.json` 或拆分为 `progress.json`、`preference.json`。
- 关键记忆修改需要通过对话确认，不由模型静默覆盖。

### 11.4 Skill / Prompt 动态引导

当前 `skills/*.md` 已全部加载进 system prompt，阶段 instruction 已拆到 `chat-prompts.ts`。P1 可增加 skill selector：

```text
UserProfileMemory + Phase + PlanState
  -> selectSkills()
  -> buildChatSystemPrompt()
```

选择策略：

- 入门用户优先注入沟通协议、问题拆解、模糊点暴露。
- 有基础用户增加假设验证、证据评价、同行评审模拟。
- 时间紧张用户强化最小可交付路径和风险压缩。

该能力仍是单 Agent + Prompt 策略，不升级为真实 Multi-Agent。

### 11.5 P1 风险控制

- 协议扩展必须向后兼容旧 `questions`。
- 所有新产物仍进入 userspace manifest。
- 图片能力先做预览和元数据，不做图片编辑、标注或复杂视觉理解。
- Memory 扩展先做可观察、可恢复，再做长期多设备同步。
- 每个 P1 增量必须补契约测试，重点覆盖协议归一化、路径校验、Markdown 图片渲染和多选交互状态。

## 12. 当前边界

MVP 当前不做：

- 用户登录。
- 多设备同步。
- 文件上传。
- 真实学生实验数据采集。
- 自动生成完整论文。
- 后台人工审核系统。

这些能力都可以在 Phase 4 之后以模块方式加入，不能破坏当前 `/api/chat + userspace + 单页工作台` 主链路。

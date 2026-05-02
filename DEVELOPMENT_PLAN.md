# 人人都能做科研 — Phase 1-4 整合验收记录

> 本文档是当前代码状态的整合检查结果，不再是待执行任务清单。

## 总体结论

Phase 1-4 已整合为一个可运行的 MVP 主链路：

```text
单页工作台
  -> /api/chat
  -> 用户画像 Memory
  -> Clarify-or-Block
  -> Plan 生成/调整
  -> 摘要/清单/路径/必要代码文件生成
  -> userspace 文件沉淀
  -> 右侧 Plan/Doc/历史对比展示
```

旧表单式 `/api/triage` 管线已清理。Phase 4 已继续扩展 `/api/chat`，没有恢复旧流程。

## Phase 1：骨架搭建

| 项目 | 状态 | 当前实现 |
|---|---|---|
| 类型扩展 | 已完成 | `src/lib/triage-types.ts` |
| Skills 加载器 | 已完成 | `src/lib/skills.ts` |
| userspace 模块 | 已完成 | `src/lib/userspace.ts` |
| Memory 模块 | 已完成 | `src/lib/memory.ts` |
| 前端三区骨架 | 已完成 | `src/app/page.tsx`, `SidePanel`, `ChatPanel` |

补充修正：

- `userspace.ts` 已增加路径片段校验，避免非法文件路径。
- 旧首页/结果/路线页改为兼容跳转，不再承载业务流程。

## Phase 2：对话闭环

| 项目 | 状态 | 当前实现 |
|---|---|---|
| `/api/chat` 核心端点 | 已完成 | `src/app/api/chat/route.ts` |
| ChatPanel 接 API | 已完成 | `chat-panel.tsx`, `chat-input.tsx`, `choice-buttons.tsx` |
| 会话持久化 | 已完成 | 前端 `sessionStorage` + 服务端内存 Map + userspace 恢复 |
| ProfileCard 展示 | 已完成 | `side-panel.tsx` 内联画像展示 |

补充修正：

- 画像低置信度字段也会返回前端显示，不再只展示 `confidence >= 0.7` 字段。
- AI 调用失败时返回 `_fallback: true` 和结构化选项，不直接让对话崩溃。
- `sendMessage` 的 React 闭包依赖已修正，撤销历史不会拿到旧状态。

## Phase 3：核心产出

| 项目 | 状态 | 当前实现 |
|---|---|---|
| Plan 生成逻辑 | 已完成 | `/api/chat` planning 阶段 |
| PlanPanel 展示 | 已完成 | `src/components/plan-panel.tsx` |
| FileList + DocPanel | 已完成 | `file-list.tsx`, `doc-panel.tsx` |
| Plan 版本保存 | 已完成 | `userspace/plan-v{n}.md` |
| 用户空间文件预览 API | 已完成 | `/api/userspace/{sessionId}/{filename}` |
| 代码产物独立保存 | 已完成 | `codeFiles` 协议 + `userspace/code-v{n}-*` |

补充修正：

- planning/reviewing 输出协议统一为 JSON，避免 markdown/JSON 混用。
- clarifying 检查通过后会在同一轮生成 Plan。
- Plan 面板中的“更简单 / 更专业 / 拆开讲 / 换方向”已接回 `/api/chat`，会生成新版本 Plan。
- `DocPanel` 请求已移入 `useEffect`，避免渲染阶段发起网络请求。
- 课题需要代码、脚本、配置或 Demo 时，代码会保存为独立文件，并可在右侧面板预览、原文打开、下载或尝试用系统默认应用打开。
- 服务重启后可从 userspace 恢复 profile 和最新 Plan 的基础状态。

## Phase 4：架构拆分与产物增强

| 项目 | 状态 | 当前实现 |
|---|---|---|
| 阶段 prompt 拆分 | 已完成 | `src/lib/chat-prompts.ts` |
| Chat pipeline 拆分 | 已完成 | `src/lib/chat-pipeline.ts` |
| 配套文档产物 | 已完成 | `summary.md`, `action-checklist.md`, `research-path.md` |
| 代码文件产物 | 已完成 | `CodeFileArtifact`, `saveCodeFile`, `codeFiles` 协议 |
| Plan 历史对比 | 已完成 | `src/components/plan-history-panel.tsx` |
| 契约测试 | 已完成 | `src/lib/chat-pipeline.test.ts`, `userspace.test.ts` |

补充修正：

- `/api/chat/route.ts` 保持为请求校验、会话恢复、AI 调用和阶段推进的编排层。
- planning/reviewing 阶段若模型在 JSON 前后混入说明文本，会优先提取协议 JSON。
- 如果 Plan 协议解析失败，不再把 JSON 原文放进聊天框，避免协议数据泄漏到 UI。
- `ProcessPanel` 从“思考流程”改为“处理摘要”，并明确显示 `AI 生成` 或 `规则兜底`。

## PRD V1.1 第 8 节模块检查

当前检查结论：P0 级别已经完成开发并形成可运行闭环；下一阶段不重建主链路，只在现有模块预留点上推进 P1。

### P0 完成度

| PRD §8 模块 | 当前状态 | 对应实现 | 备注 |
|---|---|---|---|
| 8.2 对话入口 | 已完成 | `src/app/page.tsx`, `ChatPanel`, `ChatInput` | `/` 直接进入对话工作台，旧页面只做兼容跳转。 |
| 8.3 用户画像识别 | 已完成 | `memory.ts`, `/api/chat`, `side-panel.tsx` | 10 字段画像、置信度、画像就绪规则已落地；显式画像修正入口后续做 P1。 |
| 8.4 多轮博弈引导 | P0 已完成 | 阶段机、`questions`, `ChoiceButtons`, `InlineInput` | 已支持主动追问、选项、自由输入、Plan 调整；V1.1 多选为 P1。 |
| 8.5 Plan 生成与展示 | 已完成 | `PlanState`, `PlanPanel`, `chat-pipeline.ts` | 独立 Plan 区、折叠分组、步骤级调整、版本化保存已完成。 |
| 8.6 文档预览面板 | 已完成 | `FileList`, `DocPanel`, `/api/userspace` | Markdown/代码/摘要/清单/科研路径可预览；专门 diff 视图后置。 |
| 8.1 多端适配 | 基础完成 | `globals.css` | 桌面和移动端可用；P1 交互增强后需要再次做移动端回归。 |

### P1 当前基础

| PRD §8 P1 模块 | 当前基础 | 缺口 |
|---|---|---|
| 多级选择 | `normalizeQuestions`, `splitInlineSubOptions`, `ChoiceButtons` | 没有 `single/multiple` 协议、已选状态、取消选择、确认选择。 |
| 图片 / 文档展示 | `marked`, `DocPanel`, `FileManifest.type = "image"` | Markdown 图片样式、失败兜底、外部图片元数据、图片产物保存策略不足。 |
| Memory 机制 | `UserProfileMemory`, `profile.md`, session restore | 缺少 `progress.memory`, `preference.memory`, `prompt.state` 和关键记忆确认。 |
| Skill / Prompt 动态引导 | `skills/*.md`, `skills.ts`, `chat-prompts.ts` | 目前全量注入 skills，缺少按画像/阶段选择 skill 的 selector。 |

## Phase 5：P1 功能开发计划

Phase 5 的目标是实现 PRD V1.1 第 8 节的 P1 能力，同时保证原有架构不变：

```text
单页工作台 -> /api/chat -> chat-pipeline/memory/prompt -> userspace -> 右侧预览
```

不新增第二套业务 API，不恢复旧 `/api/triage`，不引入真实 Multi-Agent/MCP。

### Phase 5.1：结构化选择协议

目标：支持单选/多选/已选状态/确认选择，同时兼容现有 `questions: string[]`。

计划：

1. 在 `src/lib/triage-types.ts` 增加 `ChoiceGroup`, `ChoiceOption`, `ChoiceMode` 类型。
2. 在 `chat-pipeline.ts` 增加 `normalizeChoiceGroups`，将模型输出或 fallback 输出归一化。
3. `/api/chat` 响应新增可选字段 `choiceGroups`，保留 `questions`。
4. `ChoiceButtons` 升级为兼容组件：没有 `choiceGroups` 时按旧逻辑单选，有 `choiceGroups` 时按 mode 渲染。
5. 多选确认后发送自然语言摘要继续走 `sendMessage`。
6. 增加契约测试覆盖：旧 `questions` 兼容、多选归一化、空选项过滤、确认文本生成。

验收：

- 旧流程不变。
- 单选点击仍可直接进入下一轮。
- 多选场景可选择、取消、确认，并能看到已选状态。

### Phase 5.2：对话内容层级和排版增强

目标：降低长回答连续堆叠的问题，满足 V1.1 的对话清晰度补充。

计划：

1. 增强 `.chat-bubble-text` 的 Markdown 样式：标题、列表、引用、表格、代码块、分隔线更清晰。
2. 增加可复用的消息分组样式，不改变 AI 协议。
3. 调整 prompt：要求较长 reply 使用分组标题和短段落，避免连续编号堆叠。
4. 移动端检查聊天气泡、按钮组、长文本不溢出。

验收：

- 多路径、多步骤、多判断内容有明显层级。
- 移动端不出现文本和按钮溢出。
- 不影响 PlanPanel 的独立结构化展示。

### Phase 5.3：图片与文档展示增强

目标：先实现基础图片预览，不做图片编辑、标注、生成或复杂视觉理解。

计划：

1. 为 `chat-bubble-text` 和 `plan-md/doc-body` 增加图片样式：`max-width: 100%`、高度自适应、边框/说明区。
2. 在 `DocPanel` 中为 Markdown 图片补加载失败兜底。
3. 扩展 `FileManifest` 图片元数据使用方式，增加 `ImageArtifact` 类型。
4. 在 `userspace.ts` 增加图片元数据保存函数，优先支持外部图片引用，不默认下载远程图片。
5. 在 `chat-pipeline.ts` 增加图片产物解析入口，和 `codeFiles` 类似但保持独立。
6. 增加 userspace 与 pipeline 测试，覆盖图片 manifest、路径校验和外部 URL 元数据。

验收：

- Markdown 图片在文档区和聊天区正常显示。
- 图片不撑破桌面/移动端布局。
- 图片加载失败有可理解提示。
- 外部图片作为元数据进入 userspace manifest。

### Phase 5.4：Memory 扩展与用户修正

目标：在现有画像 Memory 上扩展进度、偏好和 prompt 状态，不替换存储架构。

计划：

1. 增加 `SessionState` 类型，将 `messages/memory/phase/plan` 和后续 `progress/preference/promptState` 收敛到统一结构。
2. 在 userspace 中保存机器可读状态文件，例如 `state.json`。
3. 增加用户画像修正入口：从 `SidePanel` 发起“修改画像”指令，仍走 `/api/chat`。
4. 对关键记忆修改加确认：模型提出修改，用户确认后写入。
5. 恢复逻辑从 `profile.md` 扩展到 `state.json`，`profile.md` 继续保留为用户可读文档。

验收：

- 用户可以要求修改画像。
- 关键记忆变更不会静默覆盖。
- 服务重启后能恢复画像、进度、偏好和当前 Plan 基础状态。

### Phase 5.5：Skill / Prompt 动态引导

目标：继续使用单 Agent，但按画像和阶段选择提示词策略。

计划：

1. 在 `skills.ts` 增加 `selectSkills(memory, phase, plan)`。
2. `buildChatSystemPrompt` 改为只注入当前阶段需要的 skill 子集。
3. 增加 prompt state 记录，写入 `state.json` 或 process 摘要。
4. 增加测试：不同画像/阶段选择不同 skill，不破坏原 JSON 输出约束。

验收：

- 入门用户获得更低门槛解释。
- 有基础用户获得更强假设验证和证据评价。
- 时间紧张用户获得更小可交付路径。
- 输出仍严格遵守 `/api/chat` JSON 协议。

### Phase 5.6：质量与安全回归

计划：

1. 为新增协议、图片、Memory、Skill selector 补 Vitest。
2. 运行 `npm run typecheck`, `npm run test`, `npm run build`。
3. 手动 smoke：首轮对话、画像补齐、Plan 生成、Plan 调整、多选、文档预览、图片预览、服务重启恢复。
4. 安全检查：userspace 路径、外部 URL、Markdown HTML 渲染、模型协议泄漏。

完成标准：

- P0 主链路行为不回退。
- P1 能力均沿现有架构扩展。
- README/ARCHITECTURE/DEVELOPMENT_PLAN 与真实代码保持一致。

### Phase 5 完成记录

当前 Phase 5 已完成实现和回归：

| 阶段 | 状态 | 关键实现 |
|---|---|---|
| 5.1 结构化选择协议 | 已完成 | `ChoiceGroup`/`ChoiceOption` 类型、`normalizeChoiceGroups`、单选/多选兼容组件。 |
| 5.2 对话排版增强 | 已完成 | 统一 `MarkdownBlock`，增强标题、列表、引用、代码块、分隔线等层级样式。 |
| 5.3 图片与文档展示 | 已完成 | 安全 Markdown 渲染、图片失败兜底、`ImageArtifact`、userspace 图片元数据。 |
| 5.4 Memory 扩展 | 已完成 | `state.json`、`progress/preference/promptState`、服务恢复和画像修正入口。 |
| 5.5 Skill/Prompt 动态引导 | 已完成 | `selectSkills()` 按画像/阶段裁剪 skill，继续保持单 Agent 架构。 |
| 5.6 质量回归 | 已完成 | `npm run test`、`npm run typecheck`、`npm run build`、生产服务 smoke 均通过。 |

## 已清理旧代码

以下内容已删除：

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

以下内容保留：

```text
src/lib/triage.ts
src/lib/triage.test.ts
```

保留原因：规则分诊逻辑有测试覆盖，可在 Phase 4 中接入 `/api/chat` 的更强 fallback。

## 验证记录

已通过：

```bash
npm run typecheck
npm run test
npm run build
```

已手动 smoke：

- `/` 返回 200。
- `/intake` 返回 307 并跳转 `/`。
- `/api/userspace/{sessionId}` 返回文件清单。
- `/api/userspace/{sessionId}/{filename}?raw=1` 返回原始文本。
- `/api/chat` 缺参返回 400。
- `/api/chat` 真实模型调用可从 greeting 进入 profiling。
- 画像补齐后进入 clarifying。
- 假设确认后生成 `plan-v1.md`，如任务需要代码则生成 `code-v{n}-*`。
- 在 reviewing 阶段发送“更简单”生成 `plan-v2.md`。

## 后续建议任务

优先级从高到低：

1. 按 Phase 5.1 完成结构化选择协议和多选组件。
2. 按 Phase 5.2 完成对话内容层级和排版增强。
3. 按 Phase 5.3 完成图片/图示产物展示，并继续复用 userspace 文档沉淀层。
4. 按 Phase 5.4 扩展 Memory 状态与用户修正入口。
5. 按 Phase 5.5 完成 Skill / Prompt 动态引导。
6. 将服务端内存 Map 替换成持久会话存储，支持部署到多实例环境。
7. 增加人工审核记录和 Plan 质量评分。
8. 强化规则 fallback，接入 `src/lib/triage.ts` 的分诊能力。

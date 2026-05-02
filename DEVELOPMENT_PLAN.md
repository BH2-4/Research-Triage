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

1. 将服务端内存 Map 替换成持久会话存储，支持部署到多实例环境。
2. 增加人工审核记录和 Plan 质量评分。
3. 增加图片/图示产物展示，但继续复用 userspace 文档沉淀层。
4. 强化规则 fallback，接入 `src/lib/triage.ts` 的分诊能力。

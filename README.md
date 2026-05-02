# Research-Triage（人人都能做科研）

> AI for Science：让普通用户通过对话进入科研思维，并获得可执行的探索 Plan。

当前阶段：Phase 1-5 已整合为单页工作台，主链路以 `/api/chat` 为唯一对话入口。

## 项目目标

Research-Triage 是一个科研问题分诊与路径引导系统。它不做通用聊天，也不直接替用户完成论文或实验，而是通过多轮对话完成：

- 识别用户画像和约束条件。
- 暴露模糊点并强制用户确认关键假设。
- 生成科研探索 Plan。
- 支持用户挑战 Plan 并生成新版本。
- 支持单选、多选、复合选择和逃逸选项互斥。
- 将画像、Plan、摘要、行动清单、科研路径、图片引用和必要代码文件沉淀到 `userspace/{sessionId}/` 中，供右侧文档面板预览。

核心闭环：

```text
模糊想法 -> 画像识别 -> 问题收敛 -> Plan 生成 -> Plan 调整 -> 文档/代码沉淀
```

## 技术栈与选型

| 层 | 技术 / 框架 | 当前用途 | 选型说明 |
|---|---|---|---|
| Web 框架 | Next.js 16 App Router | 单页工作台、Route Handlers、生产构建 | 使用 App Router 保持页面和 API 同仓库，主链路集中在 `/api/chat`。 |
| UI 框架 | React 19 | 聊天区、Plan 面板、文档预览、选择组件 | 使用函数组件和 Hooks，状态保持在单页工作台内。 |
| 语言 | TypeScript 5 | 前后端共享类型、AI 协议、userspace manifest | 严格类型约束，核心协议位于 `src/lib/triage-types.ts`。 |
| 样式 | 原生 CSS | 工作台布局、响应式、Markdown/图片预览、多选状态 | 当前未引入 UI 组件库，避免过早增加抽象层。 |
| AI Provider | OpenAI-compatible `/chat/completions` + 原生 `fetch` | DeepSeek/OpenAI 兼容模型调用 | 不依赖特定 SDK，便于替换 `AI_BASE_URL`、`AI_MODEL`。 |
| Prompt / Skill | `skills/*.md` + `src/lib/chat-prompts.ts` + `src/lib/skills.ts` | 阶段提示词、方法论注入、按画像选择 skill | Phase 5 已支持 `selectSkills()` 动态裁剪注入。 |
| 会话状态 | 服务端内存 Map + 前端 `sessionStorage` | 当前浏览器会话、撤销、页面刷新恢复 | MVP 足够；多实例部署前应替换为持久会话存储。 |
| 文件沉淀 | 本地 `userspace/{sessionId}/` | profile、state、Plan、摘要、清单、路径、代码、图片引用 | 所有用户可见产物统一走 userspace，不新增旁路存储。 |
| Markdown | `marked` + 自定义安全 renderer | 聊天、Plan、文档富文本预览 | 原始 HTML 会转义，外部链接和图片做基础 URL 限制。 |
| 校验 | Zod | 旧规则分诊 schema | 保留在 `triage.ts` 相关路径，可继续作为 fallback 基础。 |
| 测试 | Vitest | pipeline、userspace、Markdown、Skill、选择逻辑契约测试 | 当前覆盖 AI JSON 解析、选择协议、路径安全、产物写入等关键协议。 |
| 构建 | Next.js / Turbopack | `next build` 生产构建 | 验证 App Router 页面和动态 API 均可构建。 |

当前核心依赖见 `package.json`：

- `next`
- `react`
- `react-dom`
- `typescript`
- `marked`
- `zod`
- `vitest`

## 当前架构

```text
src/
  app/
    page.tsx                         # 唯一主工作台
    layout.tsx
    globals.css
    intake/page.tsx                  # 兼容跳转到 /
    result/page.tsx                  # 兼容跳转到 /
    route-plan/page.tsx              # 兼容跳转到 /
    api/
      chat/route.ts                  # 主对话、画像、收敛、Plan、Review
      userspace/[sessionId]/[[...filename]]/route.ts # 文件清单、预览、原文、系统打开

  components/
    chat-panel.tsx
    chat-input.tsx
    choice-buttons.tsx
    markdown-block.tsx
    side-panel.tsx
    plan-panel.tsx
    plan-history-panel.tsx
    file-list.tsx
    doc-panel.tsx

  lib/
    ai-provider.ts                   # OpenAI-compatible provider
    chat-prompts.ts                  # 阶段 prompt 与状态注入
    chat-pipeline.ts                 # JSON 解析、Plan 归一化、产物生成
    markdown.ts                      # Markdown 安全渲染和图片 HTML 输出
    memory.ts                        # 用户画像记忆和置信度
    skills.ts                        # skills/*.md 加载、选择与注入
    userspace.ts                     # 会话文件存储
    triage.ts                        # 规则 fallback 基础模块
    triage-types.ts                  # 共享类型
```

旧的 `/api/triage`、`/api/generate-answer`、`/api/recommend-service` 表单式流程已清理。后续扩展应继续沿着 `/api/chat + userspace + 单页工作台` 主链路推进。

## 运行

```bash
npm install
npm run dev
```

默认访问：<http://localhost:3000>

如果端口被占用：

```bash
npm run dev -- -p 3010
```

## 环境变量

AI Provider 读取以下变量，优先级从上到下：

```text
AI_BASE_URL
AI_API_KEY
AI_MODEL

DEEPSEEK_BASE_URL
DEEPSEEK_API_KEY

OPENAI_BASE_URL
OPENAI_API_KEY
```

默认 `AI_BASE_URL` 为 `https://api.deepseek.com/v1`，默认模型为 `deepseek-v4-flash`。

## 主 API

### `POST /api/chat`

请求：

```json
{
  "message": "我想研究AI怎么帮助中学生学习物理",
  "sessionId": "client-generated-id"
}
```

响应：

```json
{
  "reply": "回复文本",
  "questions": ["结构化选项"],
  "choiceGroups": [
    {
      "id": "next-step",
      "mode": "single",
      "prompt": "选择提示",
      "options": [
        { "id": "a", "label": "按钮文案", "value": "提交给 AI 的语义" }
      ],
      "confirmLabel": "确认选择"
    }
  ],
  "profile": {},
  "profileConfidence": {},
  "phase": "profiling",
  "plan": {}
}
```

阶段：

```text
greeting -> profiling -> clarifying -> planning -> reviewing
```

规则：

- `questions` 是旧版兼容协议；`choiceGroups` 是当前结构化选择协议。
- 单组选项为 `single` 时，点击即提交。
- 单组 `multiple` 或多组选择同时出现时，用户先选择，再点击“确认选择”统一提交。
- 多组选项提交前要求每组至少选择一项；单个逃逸选项可直接确认。
- “我不太理解这些，帮我找方向”等逃逸选项每组只保留一个，并与其它选项全局互斥。
- 用户点击 Plan 面板中的“更简单 / 更专业 / 拆开讲 / 换方向”会回到 `/api/chat`，生成新版本 Plan。
- AI 调用失败时返回 `_fallback: true` 和规则选项，不直接让主流程崩溃。

### `GET /api/userspace/{sessionId}`

返回当前会话文件清单。

### `GET /api/userspace/{sessionId}/{filename}`

返回指定 Markdown 或代码文件内容，供文档面板渲染。

`GET /api/userspace/{sessionId}/{filename}?raw=1` 返回原始文本，可在新标签页打开或下载。

`POST /api/userspace/{sessionId}/{filename}?action=open` 在本地开发环境中尝试用系统默认应用打开文件。

## userspace

AI 生成的用户可见产物写入：

```text
userspace/{sessionId}/
  manifest.json
  state.json
  profile.md
  plan-v1.md
  plan-v2.md
  summary.md
  action-checklist.md
  research-path.md
  code-v2-demo.py
  image-v2-reference.json
```

当 AI 判断当前课题需要代码、脚本、配置或 Demo 骨架时，会通过 `codeFiles` 协议生成独立代码文件，而不是只写进 Plan 文档。

当 AI 判断图片、流程图、结构图或外部图示有助于理解时，会通过 `images` / `imageArtifacts` 协议写入图片引用元数据。当前默认保存外部图片 URL 和说明，不下载远程图片。

`state.json` 保存机器可读会话状态，包括进度、偏好和当前 Prompt/Skill 状态；`profile.md` 继续作为用户可读画像文档。

`userspace/` 已加入 `.gitignore`。本地开发可直接检查文件内容来调试 Plan、画像和代码产物。

## 验证命令

```bash
npm run typecheck
npm run test
npm run build
```

当前主链路 smoke 测试建议：

```bash
curl -X POST http://localhost:3010/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"我想研究AI怎么帮助中学生学习物理","sessionId":"smoke-chat"}'
```

## 后续扩展方向

- 将内存 session store 替换为可部署存储，支持多实例运行。
- 增加人工审核记录和 Plan 质量评分。
- 强化规则 fallback，接入 `src/lib/triage.ts` 的分诊能力。
- 增加真实文件上传，但继续复用 userspace 文档沉淀层。

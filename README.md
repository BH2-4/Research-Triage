# Research-Triage（人人都能做科研）

> AI for Science：让普通用户通过对话进入科研思维，并获得可执行的探索 Plan。

当前阶段：Phase 1-3 已整合为单页工作台，主链路以 `/api/chat` 为唯一对话入口。

## 项目目标

Research-Triage 是一个科研问题分诊与路径引导系统。它不做通用聊天，也不直接替用户完成论文或实验，而是通过多轮对话完成：

- 识别用户画像和约束条件。
- 暴露模糊点并强制用户确认关键假设。
- 生成科研探索 Plan。
- 支持用户挑战 Plan 并生成新版本。
- 将画像和 Plan 沉淀到 `userspace/{sessionId}/` 中，供右侧文档面板预览。

核心闭环：

```text
模糊想法 -> 画像识别 -> 问题收敛 -> Plan 生成 -> Plan 调整 -> 文档沉淀
```

## 技术栈

- 框架：Next.js 16 App Router
- 语言：TypeScript
- 前端：React 19
- AI 调用：OpenAI-compatible `/chat/completions` 裸 `fetch`
- Markdown 渲染：`marked`
- 校验：Zod
- 测试：Vitest

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
      userspace/[sessionId]/route.ts # 文件清单
      userspace/[sessionId]/[filename]/route.ts # 文档预览

  components/
    chat-panel.tsx
    chat-input.tsx
    choice-buttons.tsx
    side-panel.tsx
    plan-panel.tsx
    file-list.tsx
    doc-panel.tsx

  lib/
    ai-provider.ts                   # OpenAI-compatible provider
    memory.ts                        # 用户画像记忆和置信度
    skills.ts                        # skills/*.md 加载与注入
    userspace.ts                     # 会话文件存储
    triage.ts                        # 规则 fallback 基础模块
    triage-types.ts                  # 共享类型
```

旧的 `/api/triage`、`/api/generate-answer`、`/api/recommend-service` 表单式流程已清理。Phase 4 应继续扩展 `/api/chat`，不要恢复旧流程。

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

- `questions` 非空时，前端渲染为按钮。
- 用户点击 Plan 面板中的“更简单 / 更专业 / 拆开讲 / 换方向”会回到 `/api/chat`，生成新版本 Plan。
- AI 调用失败时返回 `_fallback: true` 和规则选项，不直接让主流程崩溃。

### `GET /api/userspace/{sessionId}`

返回当前会话文件清单。

### `GET /api/userspace/{sessionId}/{filename}`

返回指定 Markdown 文件内容，供文档面板渲染。

## userspace

AI 生成的用户可见产物写入：

```text
userspace/{sessionId}/
  manifest.json
  profile.md
  plan-v1.md
  plan-v2.md
```

`userspace/` 已加入 `.gitignore`。本地开发可直接检查文件内容来调试 Plan 和画像。

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

## Phase 4 扩展方向

- 将 `/api/chat` 内联 prompt 拆成独立 agent/prompt 模块。
- 补充 API 层契约测试，覆盖 JSON 解析失败、AI 失败 fallback、Plan 版本递增。
- 增加 userspace 文档生成阶段，例如 `summary.md`、`action-checklist.md`。
- 加入 Plan 版本对比视图。
- 将内存 session store 替换为可部署存储，支持多实例运行。

# 人人都能做科研 — MVP 技术架构总结

> 基于 PRD v1.0（`人人都能做科研_mvp_prd_审查版.md`），对照现有代码，定义前后端架构、技术栈、数据流与文件结构。

---

## 一、技术栈

| 层 | 选型 | 原因 |
|---|---|---|
| 框架 | Next.js 16 (App Router) | 已在使用，支持 API routes + React 19 |
| 语言 | TypeScript 5.9 | 类型安全，前后端共享类型 |
| AI 调用 | 裸 `fetch` → DeepSeek API | 已踩过 `@ai-sdk/openai` 兼容坑，裸调最稳定 |
| 状态管理 | React `useState` + sessionStorage | MVP 不引入状态库，单会话即可 |
| Markdown 渲染 | `marked` 或 `markdown-it` | 轻量，DocPanel 需要 |
| 样式 | CSS 变量体系（已有） | 保留 `globals.css` 色彩与面板体系 |
| 校验 | Zod 4.x | 已在使用，前后端共用 schema |
| 测试 | Vitest 4.x | 已配置 |
| 部署 | Vercel（优先） | Next.js 原生支持 |

---

## 二、前端架构

### 2.1 页面结构（单页三区）

```
┌─────────────────────────────────────────────┐
│  header（极简，仅产品名）                       │
├───────────────────────┬─────────────────────┤
│                       │                     │
│   对话区 (chat)        │   Plan 区 + 文档区    │
│                       │   (plan/doc panel)  │
│   - 消息列表           │                     │
│   - 用户输入框          │   - 用户画像卡片       │
│   - 追问选项按钮        │   - Plan 步骤列表      │
│                       │   - 风险提示          │
│                       │   - 文档预览          │
│                       │                     │
├───────────────────────┴─────────────────────┤
│  输入区（固定在底部）                           │
└─────────────────────────────────────────────┘
```

- **桌面端**：对话区左、Plan/文档区右，分栏
- **移动端**：对话区全屏，Plan/文档通过底部 Tab 或浮层切换

### 2.1.1 视觉风格（来自 PRD §9.6）

- **定位**：专业、现代、简洁、克制。有新一代 AI 工具感（如 ChatGPT Canvas / Claude Artifacts），**避免普通客服聊天机器人质感**
- **色彩**：保留现有 CSS 变量体系（暖白/陶土色系），降低饱和度的同时保持辨识度
- **重点突出**：Plan 面板和文档面板是产品的核心价值承载区，视觉权重应高于对话区
- **字体**：系统字体栈，中文优先（`system-ui, -apple-system, "PingFang SC", "Microsoft YaHei"`）
- **间距**：宽舒留白，不拥挤。面板间有明显分隔，卡片圆角统一
- **动效**：消息进入有淡入，Plan 更新有微动效提示，不花哨

### 2.2 路由规划

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | `ChatPage` | 唯一主页面，三区布局 |
| `/plan` | `PlanPage` | （P1）Plan 全屏展开页 |

`/intake`、`/result`、`/route-plan` 三个旧页面不再作为独立路由，功能融入主聊天页的三区中。

### 2.3 组件树

```
ChatPage
├── ChatPanel (左侧，移动端全屏)
│   ├── MessageList
│   │   ├── UserMessage
│   │   └── BotMessage
│   │       └── ChoiceButtons     ← 结构化选项按钮组
│   └── ChatInput
│
├── SidePanel (右侧，PC端，移动端底部Tab)
│   ├── FileList                  ← 用户空间文件列表（点击预览）
│   ├── PlanPanel
│   │   ├── ProfileCard           ← 用户画像（可折叠）
│   │   ├── PlanSteps             ← Plan 步骤列表（每步可折叠展开）
│   │   ├── RiskList              ← 风险提示
│   │   └── NextActions           ← 下一步选择按钮
│   └── DocPanel（浮层/展开）
│       └── RichDocView           ← Markdown→富文本渲染
```

### 2.4 强制选择机制（类似 OpenCode Agent 询问模式）

对话不只是自由文本。系统在关键节点**必须给出结构化选项**，用户通过点击按钮而非自由输入来推进流程。

```
┌─────────────────────────────────────┐
│  系统消息                            │
│  "你现在最想做什么？"                  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  🅐 我想先理解这个课题在说什么    │  │
│  ├───────────────────────────────┤  │
│  │  🅑 我已经理解了，想知道怎么做    │  │
│  ├───────────────────────────────┤  │
│  │  🅒 我时间很紧，直接给我最小方案  │  │
│  ├───────────────────────────────┤  │
│  │  🅓 我需要向老师解释当前进度      │  │
│  └───────────────────────────────┘  │
│                                     │
│  [其他想法…] [________________] [发送]│
└─────────────────────────────────────┘
```

**行为规则**：
- 画像识别阶段 → 强制选择（年龄段/工具能力/兴趣方向）
- 目标确认阶段 → 强制选择（研究方向/交付物/时间优先级）
- 路径分支阶段 → 强制选择（更简单/更专业/拆开讲/换方向）
- 底部保留自由输入框作为"其他想法"逃生通道

**状态机**：

```
free_input → system_asks → user_selects → free_input → ...
              ↑                              │
              └── 禁止：自由输入绕过选择 ──────┘
```

关键约束：
- `questions[]` 不为空时 → 消息气泡内渲染为可选择按钮，自由输入框缩小为辅助
- 用户点击按钮 → 按钮文本作为本轮"用户回复"发送
- 用户不选、直接打字 → 允许，但系统下一轮依然会追问（不跳过阶段）

### 2.4.1 严格 Plan 机制（Clarify-or-Block）

**核心原则：AI 不得隐藏、回避或假设任何模糊不清的问题。任何未与用户协商确认的假设，必须以 OpenCode/ClaudeCode 式的结构化选项摆在用户面前，要求用户明确决定。**

#### Plan 生成前置检查清单

AI 在生成 Plan 之前，必须逐项检查以下清单。**任一项未通过，Plan 不得生成，必须先与用户确认该项**：

| # | 检查项 | 未通过时的行为 |
|---|--------|---------------|
| 1 | 用户身份已确认？（≥4 个画像字段） | 追问缺失字段，给出猜测选项 |
| 2 | 用户目标已收敛为一个明确问题？ | 列出 2-3 个可能的解读，让用户选 |
| 3 | 用户工具能力已确认？ | 给出 3 档能力选项按钮 |
| 4 | 用户时间约束已明确？ | 追问"你希望在多久内完成？" |
| 5 | 用户期望的交付物已明确？ | 列出可选交付物类型按钮 |
| 6 | 存在任何 AI 做出的隐含假设？ | **每个假设**渲染为一个确认卡片 |
| 7 | 用户问题是否过大（超出了当前工具/时间能力）？ | 追问：建议缩小范围，给出 2-3 个可操作的子问题 |
| 8 | 用户想法在当前约束下是否可执行？ | 如不可执行 → 明确告知原因 + 给出降级替代方案 |
| 9 | 用户是否要求跨越过多阶段（如直接要求"做完整个项目"）？ | 追问：先聚焦第一阶段，给出最小可交付物选项 |

#### 假设确认卡片

```
┌──────────────────────────────────────┐
│  ⚠ 系统在生成 Plan 前做了以下假设：     │
│                                      │
│  假设 1：你可以使用电脑浏览器访问网页    │
│  [✅ 正确]  [❌ 不对，我用的是____]     │
│                                      │
│  假设 2：你每天可以投入 1-2 小时        │
│  [✅ 正确]  [❌ 不对，我时间更少/更多]   │
│                                      │
│  假设 3：你需要产出的是可展示项目而非论文  │
│  [✅ 正确]  [❌ 不对，我需要____]       │
│                                      │
│  [全部确认，生成 Plan]                 │
└──────────────────────────────────────┘
```

#### Plan 生成后的博弈机制

Plan 展示后，用户可对 **Plan 中任何一个部分** 发起挑战：

```
用户在 PlanPanel 中点击某一步骤
  ↓
弹出 4 个操作按钮：
  [更简单] [更专业] [拆开讲] [换方向]
  ↓
用户选择 → 该步骤被标记为"用户要求调整"
  ↓
系统重新生成该步骤，展示新旧对比
  ↓
用户 [确认修改] 或 [再调整]
```

#### Plan 版本控制

- 每次用户挑战/调整 → Plan 版本号 +1（`plan-v1.md` → `plan-v2.md`）
- 前端展示当前版本号和上一版本的差异
- 旧版本不删除，通过 `FileList` 的版本标签查看
- PlanPanel 底部提供 `[查看历史版本]` 按钮，点击展开版本列表
- 选择两个版本 → 并行对比展示，新增/删除/修改内容用不同颜色标注
- 文档区同样支持：`summary.md` 更新时保留上一版为 `summary-v{n}.md`，DiffView 并行展示

### 2.5 整体交互流程

```
用户首次进入 → 系统主动问好 + 给出第一个引导选择
  ↓
用户点击按钮 或 在底部输入框自由输入
  ├─ 点击按钮：提取按钮文本作为 message → POST /api/chat
  └─ 自由输入：输入框文本作为 message → POST /api/chat
  ↓
POST /api/chat { message, sessionId }
  ↓
系统返回 { reply, questions?, files?, profile?, plan?, doc?, nextActions? }
  ↓
前端按顺序处理响应：
  1. 创建 assistant ChatMessage { content: reply, questions }
  2. 追加到 messages[]，滚动到底部
  3. files 有值 → 更新 FileList 面板
  4. profile 有值 → 更新 ProfileCard
  5. plan 有值 → 更新 PlanPanel
  6. doc 有值 → 更新 DocPanel（自动预览最新文档）
  7. nextActions 有值 → 更新底部快捷入口
  8. saveSession() → 写 sessionStorage
```

**文件点击预览**：
```
用户在 FileList 点击 "plan-v1.md"
  ↓
GET /api/userspace/{sessionId}/plan-v1.md
  ↓
收到 { filename, title, content, createdAt }
  ↓
setDoc({ title, content: markdown → HTML, sections: [] })
  ↓
DocPanel 展开，展示富文本
```

关键规则（来自 PRD §10.2）：
- 用户身份不清 → 系统追问，不直接给 Plan
- 用户目标不清 → 系统追问
- profile 确认 + 问题收敛 → 生成 Plan
- Plan 稳定 → 生成文档预览

---

## 三、后端架构

### 3.1 文件结构

```
src/
├── app/
│   ├── layout.tsx              # 保留，更新 metadata
│   ├── page.tsx                # → ChatPage（重写）
│   ├── globals.css             # 保留，追加 chat/plan 样式
│   └── api/
│       ├── chat/
│       │   └── route.ts        # POST /api/chat（核心对话端点）
│       └── userspace/
│           └── [sessionId]/
│               └── [filename]/
│                   └── route.ts  # GET /api/userspace/:id/:file（文件预览）
│       └── admin/
│           └── review/
│               ├── route.ts      # GET /api/admin/review（审核列表）
│               └── [sessionId]/
│                   ├── route.ts  # GET /api/admin/review/:id（审核详情）
│                   └── flag/
│                       └── route.ts  # POST flag（标注审核意见）
│
├── lib/
│   ├── ai-provider.ts          # 保留 —— 裸 fetch + DeepSeek
│   ├── ai-triage.ts            # 🟡 重构 —— 拆成对话式 pipeline
│   ├── triage-types.ts         # 🟡 扩展 —— 加 ChatMessage、Plan、FileManifest 等类型
│   ├── triage.ts               # 保留 —— 规则 fallback（不删）
│   ├── route-plan.ts           # 保留 —— 被 Plan 生成复用
│   ├── storage.ts              # 🟡 扩展 —— 加 conversation history key
│   ├── userspace.ts            # 新 —— 用户空间文件读写管理
│   └── skills.ts               # 新 —— Skills 加载与注入
│
├── components/
│   ├── chat-panel.tsx          # 新
│   ├── chat-message.tsx        # 新（含选择按钮渲染）
│   ├── chat-input.tsx          # 新
│   ├── choice-buttons.tsx      # 新 —— 结构化选项按钮组
│   ├── plan-panel.tsx          # 新
│   ├── plan-steps.tsx          # 新
│   ├── profile-card.tsx        # 新
│   ├── file-list.tsx           # 新 —— 用户空间文件列表
│   ├── doc-panel.tsx           # 新
│   └── rich-doc-view.tsx       # 新
│
└── prompt_templates/           # 保留 —— 7 个模板文件不变
    ├── input_normalizer.md
    ├── triage_classifier.md
    ├── need_clarifier.md
    ├── response_router.md
    ├── answer_generator.md
    ├── quality_checker.md
    └── service_recommender.md

userspace/                      # 用户生成文件存储（服务端磁盘）
└── {sessionId}/
    ├── manifest.json           # 文件清单（名称、标题、类型、时间）
    ├── profile.md              # 用户画像文档
    ├── plan-v1.md              # Plan 第 1 版
    ├── plan-v2.md              # Plan 第 2 版（调整后）
    ├── action-checklist.md     # 行动清单
    ├── research-path.md        # 研究路径文档
    ├── image-{n}.png            # 用户上传的参考图片（P1）
    └── review-notes.json        # 人工审核标注（后台生成）
```

### 3.2 `/api/chat` 核心端点

这是 MVP 唯一的对话端点。根据消息轮次和 state 走不同逻辑：

```
POST /api/chat
Body: {
  message: string;        // 用户输入（文本或选择的按钮内容）
  sessionId: string;      // 会话 ID（前端生成 UUID）
}
Response: {
  reply: string;          // 系统回复文本
  questions?: string[];   // 需要追问时给出选项（渲染为按钮）
  files?: FileManifest[]; // 用户空间文件清单更新
  profile?: UserProfileState;  // 识别到画像时返回
  plan?: PlanState;       // Plan 就绪时返回
  doc?: DocState;         // 当前预览文档内容
  nextActions?: string[]; // 下一步可选操作
}
```

### 3.3 用户空间（userspace/）

MVP 最核心的后端机制之一：**所有 AI 生成的、用户应该看到的结果，都以文件形式持久化在 `userspace/{sessionId}/` 目录下。**

#### 3.3.1 设计原则

- 每个会话一个子目录，以 `sessionId` 命名
- AI 每生成一次 Plan、文档、清单、路径 → 写一个 `.md` 文件
- 文件更新时保留版本（`plan-v1.md`, `plan-v2.md`）
- 前端通过 `files[]` 字段获知当前有哪些文件
- 用户点击文件名 → `GET /api/userspace/{sessionId}/{filename}` → 返回文件内容

#### 3.3.2 文件类型

| 文件 | 内容 | 触发时机 |
|------|------|----------|
| `manifest.json` | 文件清单元数据 | 每次文件变更时更新 |
| `profile.md` | 用户画像文档 | profiling 阶段完成 |
| `plan-v{n}.md` | 科研探索计划 | planning 阶段每次生成 |
| `action-checklist.md` | 可执行行动清单 | plan 确认后 |
| `research-path.md` | 研究路径说明 | plan 确认后 |
| `summary.md` | 当前会话总结 | reviewing 阶段 |
| `image-{n}.png` | 用户上传的参考图片 | 用户主动上传时 |

#### 3.3.3 文件预览 API

```
GET /api/userspace/{sessionId}/{filename}

Response:
{
  filename: "plan-v1.md",
  title: "科研探索计划 v1",
  content: "# 科研探索计划\n\n## 你的当前画像\n...",  // raw markdown
  createdAt: "2026-05-02T10:30:00Z"
}
```

前端 DocPanel 拿到 content 后做 Markdown → 富文本渲染，**禁止显示 Markdown 源码符号**。

#### 3.3.4 `userspace.ts` 工具

```ts
// 核心函数
ensureSessionDir(sessionId: string): string;
writeFile(sessionId: string, filename: string, content: string): void;
readFile(sessionId: string, filename: string): string | null;
getManifest(sessionId: string): FileManifest[];
listFiles(sessionId: string): string[];

type FileManifest = {
  filename: string;
  title: string;
  type: "profile" | "plan" | "checklist" | "path" | "summary" | "image";
  version: number;
  createdAt: string;
};
```

图片支持说明（P1）：
- 用户在对话中粘贴图片 → 前端将其上传至 `userspace/{sessionId}/image-{n}.png`
- 图片 metadata 写入 manifest.json（type: "image"）
- 图片出现在 FileList 中，点击可在 DocPanel 预览
- 图片不要求 OCR 或完整编辑，只做基础展示

### 3.4 服务端会话状态（内存 Map）

MVP 不接数据库，用内存 Map：

```ts
// 服务端 session store（重启丢失，MVP 可接受）
const sessions = new Map<string, ChatSession>();

type ChatSession = {
  messages: ChatMessage[];         // 对话历史
  profile: UserProfileState | null;    // 累积画像
  plan: PlanState | null;          // 当前 Plan
  doc: DocState | null;            // 当前文档
  phase: Phase;                    // 当前阶段
  promptState: {                   // 当前 Prompt/Skill 状态（PRD §11.4）
    activeTemplate: string;        // 当前 prompt 模板名称
    explanationDepth: "simple" | "normal" | "professional";  // 解释深度
    interactionMode: "guided" | "free";  // 交互模式
  };
  preference: {                    // 用户交互偏好（PRD §11.2）
    preferredLanguage: string;     // 偏好语言风格
    wantsSimpleMode: boolean;      // 是否要求过更简单模式
    lastTopic: string;             // 最近讨论话题
  };
};

type Phase = "greeting" | "profiling" | "clarifying" | "planning" | "reviewing";
```

### 3.5 错误处理与冗余机制

#### 3.5.1 AI 调用失败

```
aiCall() 失败
  ├─ 第 1 次重试（1s 后）
  ├─ 第 2 次重试（2s 后）
  ├─ 仍失败 → 检查 error.message
  │     ├─ "Not Found" → 模型配置错误，返回 { error: "模型配置异常" }
  │     ├─ "401" → 密钥错误，返回 { error: "API密钥无效" }
  │     └─ 其他 → 降级到规则 fallback
  └─ 规则 fallback：triageIntake()（已有 triage.ts）
```

规则 fallback 输出通过 `TriageResponse → PlanState` 转换适配前端 Plan 面板。

#### 3.5.2 用户空间写入失败

```
writeFile() 失败（磁盘满/权限）
  ├─ 文件写入失败 → 仍返回 plan/profile/doc 给前端（内存数据可用）
  ├─ 下一次请求时重试写入
  └─ 连续 3 次失败 → 标记 session.phase = "degraded"（降级模式）
```

降级模式下：对话正常，但文件不持久化，刷新后丢失。前端提示用户"文档暂未保存"。

#### 3.5.3 会话恢复与丢失

```
前端 POST /api/chat
  ├─ 携带 sessionId
  ├─ 服务端 sessions.get(sessionId) → 有 → 继续
  └─ 服务端 sessions.get(sessionId) → 无（重启丢失/过期）
        ├─ 尝试从 userspace/{sessionId}/manifest.json 读取
        │    └─ 有 → 重建 ChatSession，从文件恢复 phase
        └─ 无 → 创建新 session，phase = "greeting"
```

前端刷新恢复：
```
sessionStorage.getItem("triage:chat-session")
  ├─ 有 → 恢复 messages, profile, plan, doc, files, sessionId
  └─ 无 → 空状态，等待用户首次输入
```

#### 3.5.4 前端异常边界

- 每个面板组件独立 `try/catch`，一个面板崩溃不影响其他面板
- 顶层 `<ErrorBoundary>` 兜底：显示"系统异常，请刷新页面"
- API 请求失败 → 错误信息渲染在消息列表最后一条，不阻塞界面
- `sessionStorage` 不可用（隐私模式）→ 降级为纯内存状态，提示用户"刷新将丢失进度"

#### 3.5.5 用户空间清理

- 开发期：手动清理 `userspace/` 目录
- 部署后：`manifest.json` 记录 `createdAt`，超过 24 小时的 session 目录可自动清理
- 会话结束 → 不立即删除，保留 24 小时供回看

### 3.6 人工审核与迭代反馈（来自 PRD §7.6）

#### 3.6.1 审核端点

```
GET /api/admin/review
  → 列出最近 N 个会话的摘要（sessionId, phase, profile置信度平均值, Plan版本数）
  
GET /api/admin/review/{sessionId}
  → 返回该会话的完整数据：messages[], profile, plan历史, doc列表
  
POST /api/admin/review/{sessionId}/flag
  Body: { aspect: "profile"|"plan"|"clarify"|"style"|"doc", note: string }
  → 标记人工审核意见
```

#### 3.6.2 审核重点（6 项）

| # | 审核项 | 数据来源 |
|---|--------|---------|
| 1 | 用户画像是否准确 |`profile.md` 对照对话历史判断 |
| 2 | 追问是否必要 | 对话中包含 `questions[]` 的轮次，检查追问是否针对真实模糊点 |
| 3 | Plan 是否具体 | `plan-v{n}.md` 内容是否可执行 |
| 4 | 行动步骤是否可执行 | PlanState.actionSteps 每条是否有时限和操作对象 |
| 5 | 语言风格是否适合用户 | 对照 profile.explanationPreference 检查回答复杂度 |
| 6 | 文档展示是否清楚 | DocPanel 渲染结果检查 |

#### 3.6.3 反馈闭环

```
人工标注问题 → flag 记录写入 sessions/{id}/review-notes.json
  ↓
定期（MVP 手动）分析 review-notes.json
  ↓
反向改进：
  1. 调整 prompt_templates/*.md 模板
  2. 调整 Skills/*.md 中的追问规则和解释策略
  3. 调整 trait-types.ts 中的画像分类逻辑
  4. 调整 Plan 模板（plan-steps.tsx 展示结构）
  5. 调整前端 ChoiceButtons 的追问选项数量与文案
```

MVP 阶段人工执行上述反向改进，不建自动化 pipeline。

---

## 四、数据传输与状态管理

### 4.1 前端状态

```ts
// 组件内 useState
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [profile, setProfile] = useState<UserProfileState | null>(null);
const [plan, setPlan] = useState<PlanState | null>(null);
const [doc, setDoc] = useState<DocState | null>(null);
const [files, setFiles] = useState<FileManifest[]>([]);
const [nextActions, setNextActions] = useState<string[]>([]);
const [sessionId, setSessionId] = useState<string>(() => {
  // 优先从 sessionStorage 恢复，否则生成新 UUID
  const saved = sessionStorage.getItem("triage:session-id");
  if (saved) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem("triage:session-id", id);
  return id;
});
const [loading, setLoading] = useState(false);
```

通过 `sessionStorage` 做会话恢复（刷新不丢）：

```ts
// storage.ts 新增 key
export const chatSessionKey = "triage:chat-session";

// ChatPage 定期全量备份（每次 API 响应后触发）
function saveSession() {
  sessionStorage.setItem(chatSessionKey, JSON.stringify({
    messages, profile, plan, doc, files, nextActions, sessionId
  }));
}
```

### 4.2 核心类型扩展

保留现有所有类型，新增：

```ts
// 对话消息 —— 前端显示用，questions 绑定到 assistant 消息
type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  questions?: string[];          // 仅 assistant 消息可能有，渲染为 ChoiceButtons
  timestamp: number;
};

// API 响应中的 questions 和 nextActions 是顶层字段，
// 前端收到后执行：
//   1. 创建 assistant ChatMessage { content: reply, questions: questions }
//   2. 追加到 messages[]
//   3. 调用 setNextActions(nextActions ?? [])

// 用户画像（PRD §11.1）—— API 对外暴露的扁平版本
type UserProfileState = {
  ageOrGeneration: string;       // 年龄段/时代背景
  educationLevel: string;        // 教育水平
  toolAbility: string;           // 工具使用能力
  aiFamiliarity: string;         // AI 熟悉程度
  researchFamiliarity: string;   // 科研理解程度
  interestArea: string;          // 兴趣方向
  currentBlocker: string;        // 当前卡点
  deviceAvailable: string;       // 可投入设备（手机/电脑/平板）
  timeAvailable: string;         // 可投入时间（碎片/每天1h/每天3h+）
  explanationPreference: string; // 偏好解释风格
};
// 注：后端内部使用 UserProfileMemory（带 confidence 的 ProfileField 包装），
// 见 §4.4.1。API 只暴露 UserProfileState 扁平值给前端展示。

// Plan 状态（PRD §8.5 + §11.3 历史元数据）
type PlanState = {
  userProfile: string;           // 用户画像摘要
  problemJudgment: string;       // 当前问题判断
  systemLogic: string;           // 系统判断逻辑
  recommendedPath: string;       // 推荐路径
  actionSteps: string[];         // 可执行步骤
  riskWarnings: string[];        // 风险提示
  nextOptions: string[];         // 下一步选择
  // 版本元数据（追加到 userspace/manifest.json，不在前端 state 中）
  version: number;               // 当前版本号
  modifiedReason?: string;       // 本次修改原因（用户挑战/系统修正）
  userFeedback?: string;         // 用户反馈摘要
  isCurrent: boolean;            // 是否为当前采用版本
};

// 文档状态（PRD §8.6）
type DocState = {
  title: string;
  content: string;               // Markdown 原文（前端负责渲染）
  sections: { heading: string; body: string }[];
};
```

### 4.3 数据流图

```
前端 ChatPage
  │
  ├─ [用户输入] → POST /api/chat
  │                   │
  │                   ├─ phase=greeting → 欢迎语 + 追问
  │                   ├─ phase=profiling → 画像识别 + 追问
  │                   ├─ phase=clarifying → 多轮博弈
  │                   ├─ phase=planning → 生成 Plan
  │                   └─ phase=reviewing → 生成文档
  │
  ├─ [响应] → 更新 messages / profile / plan / doc / files / nextActions
  │
  └─ sessionStorage ← saveSession() 全量备份
```

### 4.4 严格 Memory 机制（用户画像确立与持久化）

**核心原则：用户画像是通过每轮对话与用户的交互博弈逐步确立的。系统在每轮对话中探测、修正、确认用户的思维链路和真实意图。画像一旦确认，必须永久存储在本地，保证会话随时可恢复。**

#### 4.4.1 画像字段与置信度

每个画像字段带置信度，未确认的字段不能作为 Plan 依据：

```ts
type ProfileField<T> = {
  value: T;
  confidence: number;       // 0.0 = 猜测, 0.5 = AI判断, 0.7 = 用户间接确认, 1.0 = 用户直接确认
  source: "inferred" | "deduced" | "user_confirmed";
  updatedAt: number;
};

type UserProfileMemory = {
  ageOrGeneration: ProfileField<string>;
  educationLevel: ProfileField<string>;
  toolAbility: ProfileField<string>;
  aiFamiliarity: ProfileField<string>;
  researchFamiliarity: ProfileField<string>;
  interestArea: ProfileField<string>;
  currentBlocker: ProfileField<string>;
  deviceAvailable: ProfileField<string>;
  timeAvailable: ProfileField<string>;
  explanationPreference: ProfileField<string>;
};
```

#### 4.4.2 画像确立流程（博弈式）

```
第 N 轮对话
  ↓
AI 分析用户最新输入
  ↓
对每个画像字段：
  ├─ 已有 (user_confirmed, confidence=1.0) → 保持不变
  ├─ 已有 (inferred, confidence<0.7) → 本轮首次出现反驳证据 → 降低 confidence
  ├─ 已有 (deduced, confidence=0.7+) → 本轮出现暗示性证据 → 提升 confidence
  └─ 新发现线索 → 创建 (inferred, confidence=0.3) 并追问
  ↓
confidence < 0.7 的字段累计 ≥ 3 个 → 触发追问回合
  ↓
追问回合中逐一确认低置信度字段 → 提升至 user_confirmed
  ↓
≥ 6 个字段达到 user_confirmed → profile 就绪 → 可进入 planning
```

#### 4.4.3 画像修正协议

用户可在任何时候修正画像，系统必须响应：

```
用户："其实我不是学生，我是上班族"
  ↓
系统：识别到对 educationLevel 的修正意图
  ↓
系统回复："明白了，我之前判断你是学生，但你是上班族。我会更新你的画像：职业身份 = 职场人士，学习基础 = 重新评估。"
  ↓
同步更新：
  1. educationLevel.value = "职场人士", confidence = 1.0, source = "user_confirmed"
  2. 级联降低相关字段：toolAbility.confidence *= 0.5, aiFamiliarity.confidence *= 0.5
  3. 标记需要重新评估的字段 → 触发追问
  4. 写入 userspace/{sessionId}/profile.md（永久存储）
```

**Memory 修改确认 UI**：关键画像字段变更时，前端展示确认卡片：

```
┌──────────────────────────────────────┐
│  📝 即将更新你的画像：                  │
│                                      │
│  教育水平：学生 → 职场人士             │
│  工具能力：将被重新评估（置信度降低）    │
│  AI熟悉程度：将被重新评估（置信度降低）  │
│                                      │
│  [确认修改]  [取消]                    │
└──────────────────────────────────────┘
```

只有用户点击"确认修改"后，API 才写盘。`explanationPreference` 等非关键字段变更可直接生效，不弹确认。

#### 4.4.4 持久化与恢复

```
画像存储位置（三层冗余）：
  1. 内存：sessions Map 中的 ChatSession.profile（服务重启丢失）
  2. 磁盘：userspace/{sessionId}/profile.md（服务重启可恢复）
  3. 前端：sessionStorage["triage:chat-session"].profile（刷新可恢复）

会话恢复优先级：
  sessionStorage.profile > userspace/profile.md > 空白画像
```

前端额外支持手动导出：
- 按钮："导出画像和对话记录"
- 输出 JSON 文件下载，包含完整的 `UserProfileMemory` + 对话历史

#### 4.4.5 Memory 的 Plan 约束力

Image 字段直接影响 Plan 生成：
- `confidence < 0.5` → Plan 中该维度的建议**不得作为确定性结论**
- `confidence ≥ 0.7` → 可用，但标注"基于当前判断"
- `confidence = 1.0` → 直接作为 Plan 的基础假设
- 任一字段被用户手动修正 → Plan 自动标记为"待重新生成"

---

## 五、Skills 机制（方法论强制注入）

### 5.1 设计目的

Skills 是产品的**方法论脊梁**。它储存了一套完整、严谨、符合科研基本方法论的规则集。AI 在启动会话时**强制加载所有 Skill**，确保 AI 始终按照科学方法论执行上述全部流程，不跳过不回避不臆断。

### 5.2 Skills 目录结构

```
skills/
├── 00-core-methodology.md      # 核心科学方法论（最优先加载）
├── 01-question-decomposition.md # 问题拆解法
├── 02-knowledge-gap-analysis.md # 知识缺口分析
├── 03-hypothesis-testing.md    # 假设提出与验证
├── 04-evidence-evaluation.md   # 证据评估与分级
├── 05-iterative-refinement.md  # 迭代修正法
├── 06-ambiguity-surfacing.md   # 模糊点暴露与确认
├── 07-peer-review-simulation.md # 自审查机制
├── 08-communication-protocol.md # 成果沟通规范
└── 09-safety-boundary.md       # 安全边界与伦理
```

### 5.3 加载机制

```
服务端启动 / 首次会话创建
  ↓
读取 skills/ 目录下所有 .md 文件
  ↓
按文件名前缀排序（00-09）
  ↓
拼接为一个完整的 "SYSTEM_SKILLS" 字符串
  ↓
每次 AI 调用时，SYSTEM_SKILLS 作为 system prompt 的最前导内容注入
  格式：system = SYSTEM_SKILLS + "\n\n" + 具体任务指令
```

**强制规则**：
- AI 不得声明"已理解"后跳过 Skill 中的任何条约
- 任何与 Skill 冲突的输出 → 质量检查阶段自动驳回
- 用户要求"跳过 Skill" → 系统拒绝，提示"为了保证科研严谨性，某些流程不能跳过"

### 5.4 各 Skill 核心内容概要

| Skill | 核心条约 | 对应功能 |
|-------|---------|---------|
| 00-core-methodology | 科学方法五步：提问→分解→假设→验证→迭代。任何阶段不得跳过分解步骤。 | 全局约束 |
| 01-question-decomposition | 把用户模糊输入拆为：研究对象、已知条件、未知变量、约束条件。拆不完全不得进入下一步。 | profiling, clarifying |
| 02-knowledge-gap-analysis | 在给建议前，先明确：用户已知什么、未知什么、哪些可以通过简单工具补足、哪些需要系统学习。 | profiling |
| 03-hypothesis-testing | 任何 Plan 中的建议都以假设形式呈现："如果按 X 路线走，预期结果 Y，验证方法是 Z"。 | planning |
| 04-evidence-evaluation | 区分四类证据：直接证据、间接证据、推测、观点。Plan 只依赖前两类。 | planning, reviewing |
| 05-iterative-refinement | Plan 不是一次性输出。每轮用户反馈 → 重新评估假设 → 修正路径。 | planning, reviewing |
| 06-ambiguity-surfacing | 遇到模糊点必须主动列出，用选择题而非填空题让用户确认。禁止 AI 自行填充模糊信息。 | clarifying, Plan 前置检查 |
| 07-peer-review-simulation | AI 生成任何结论后，必须模拟一个"同级审查者"角色质疑：这个结论站得住吗？证据够吗？假设合理吗？ | quality check |
| 08-communication-protocol | 输出遵循：用户画像匹配语言 → 先结论后展开 → 每一步标注前提和不确定性。 | answer generation |
| 09-safety-boundary | 禁止代写、伪造数据、危险实验、保证科研成功、替代专业人士、大段术语堆砌。不把普通用户推向复杂工具。识别风险→合规引导。 | 全局约束 |

### 5.5 Skill 与 Plan / Memory / 强制选择的联动

```
用户输入 → SYSTEM_SKILLS 激活
  ↓
00-core-methodology 检查：当前处于科学方法哪一步？
  ↓
01-question-decomposition 执行：问题拆解
  ↓
06-ambiguity-surfacing 触发：发现模糊点 → 强制选择按钮
  ↓
02-knowledge-gap-analysis 执行：评估用户水平 → 写入 Memory
  ↓
03-hypothesis-testing 执行：生成 Plan（所有步骤带假设标记）
  ↓
07-peer-review-simulation 执行：自我审查 → 修正
  ↓
08-communication-protocol 执行：按用户画像风格输出
```

### 5.6 技术实现

```ts
// lib/skills.ts
import { readFileSync, readdirSync } from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

let cachedSkills: string | null = null;

/** 加载全部 Skill，启动时调用一次，结果缓存 */
export function loadSkills(): string {
  if (cachedSkills) return cachedSkills;

  const files = readdirSync(SKILLS_DIR)
    .filter(f => f.endsWith(".md"))
    .sort(); // 00 → 09

  cachedSkills = files
    .map(f => readFileSync(path.join(SKILLS_DIR, f), "utf-8"))
    .join("\n\n---\n\n");

  return cachedSkills;
}

/** 每次 AI 调用时，拼接到 system prompt 前面 */
export function buildSystemPrompt(taskInstruction: string): string {
  const skills = loadSkills();
  return `${skills}\n\n---\n\n## 当前任务指令\n\n${taskInstruction}`;
}
```

---

## 六、AI Pipeline 设计

### 6.1 服务端流程

每次 `/api/chat` 调用，服务端：

```
1. loadSkills() → 获取 SYSTEM_SKILLS（首次调用后缓存）
2. 从 sessions Map 读取/创建 ChatSession
3. 把 user message 追加到 messages[]
4. buildSystemPrompt(任务指令) → 拼接完整 system prompt
5. 根据 session.phase 决定下一步：
   ├─ greeting  → 返回欢迎语 + 1-2 个引导追问
   ├─ profiling → 调 AI 识别用户画像
   │              - 有足够信息 → 更新 profile，进入 clarifying
   │              - 信息不足 → 返回追问
   ├─ clarifying→ 调 AI 进行多轮博弈
   │              - 问题收敛 → 进入 planning
   │              - 仍有模糊 → 继续追问
   ├─ planning  → 调 AI 生成 Plan
   │              - 返回 plan 对象
   └─ reviewing → 调 AI 生成文档
                  - 返回 doc 对象
4. 把 AI reply 追加到 messages[]
5. 返回 Response
```

### 6.2 AI 调用复用

| 阶段 | 复用现有函数 | prompt 模板 |
|------|-------------|------------|
| profiling | `aiTriageAnalysis()` 的 normalized + triage 部分 | `triage_classifier.md` |
| clarifying | `need_clarifier.md` 逻辑 | `need_clarifier.md` |
| planning | `buildRoutePlan()` + AI 生成的 Plan | `response_router.md` + `answer_generator.md` |
| reviewing | `aiRecommendService()` → 改为生成文档 | 新 prompt |

### 6.3 AI 行为规则（来自 PRD §10 + Skills 约束）

- 用户身份/目标/工具能力不清 → **必须追问**
- 不直接输出完整长方案 → 先追问再生成
- Plan 必须含：画像 + 判断 + 路径 + 步骤 + 风险 + 下一步
- **禁止**：代写、伪造、危险实验、Markdown 源码暴露
- **禁止**：把普通用户直接推向复杂论文、专业数据库或科研工具链
- **禁止**：承诺或暗示"保证科研成功""保证发表""保证通过"
- **禁止**：替代专业导师、医生、律师或安全专家角色
- **禁止**：输出用户看不懂的大段术语堆砌（术语必须附带人话解释）
- **问题过大/想法无法执行/要求跨越阶段** → 必须追问收敛，不得跳过
- 所有输出遵循 §08-communication-protocol：按用户画像匹配语言，先结论后展开

### 6.4 Multi-Agent 架构（P2，当前纳入框架设计）

**核心原则：用户只与一个 Agent 对话——"前台 Agent"。后台有多 Agent 并行执行各自任务，但对用户完全透明。**

#### 6.4.1 Agent 角色定义

```
                          ┌─────────────────┐
                          │   前台 Agent     │
                          │  (User Agent)   │
                          │                 │
                          │  与用户直接交互   │
                          │  遵循全部Skills   │
                          │  理解用户/问题    │
                          │  生成Plan/文档    │
                          └────────┬────────┘
                                   │ 调度 & 合成
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
    ┌─────▼──────┐         ┌──────▼──────┐          ┌──────▼──────┐
    │ 研究 Agent │         │ 规划 Agent  │          │ 文档 Agent  │
    │ (Researcher)│        │ (Planner)   │          │  (Writer)   │
    │            │         │             │          │             │
    │ 搜索信息    │         │ 拆解子任务   │          │ 生成文档     │
    │ 收集资料    │         │ 细化步骤     │          │ 格式化输出   │
    │ 评估信源    │         │ 评估可行性   │          │ 生成清单     │
    └────────────┘         └─────────────┘          └─────────────┘
          │                        │                        │
    ┌─────▼──────┐         ┌──────▼──────┐          ┌──────▼──────┐
    │ 审查 Agent │         │ 适配 Agent  │          │ 验证 Agent  │
    │ (Reviewer) │         │ (Translator)│          │ (Verifier)  │
    │            │         │             │          │             │
    │ 质量检查    │         │ 概念翻译     │          │ 事实核查     │
    │ 方法论审查  │         │ 按画像降维   │          │ 安全扫描     │
    │ 安全审查    │         │ 人话解释     │          │ 逻辑验证     │
    └────────────┘         └─────────────┘          └─────────────┘
```

| Agent | 角色 | 何时触发 | 输入 | 输出 |
|-------|------|---------|------|------|
| **User Agent** (前台) | 用户唯一对话入口，调度者 | 始终活跃 | 用户消息 + 历史 | 用户可见的 reply/questions/plan/doc |
| **Researcher** | 信息收集与信源评估 | User Agent 判断需要外部信息时 | 搜索关键词 / 研究方向 | 结构化信息 + 信源可信度 |
| **Planner** | Plan 步骤细化与可行性评估 | Plan 生成 / 用户要求拆解某步时 | 高层次步骤描述 | 细化子步骤 + 时间估算 + 所需资源 |
| **Writer** | 文档生成与格式化 | Plan 确认后 / 用户要求输出文档时 | Plan + 画像 | Markdown 文档 → 写入 userspace/ |
| **Reviewer** | 质量 + 方法论 + 安全审查 | 任何 Agent 输出后（自动触发） | 任意 Agent 的输出 | pass/fail + 修正建议 |
| **Translator** | 概念降维与人话翻译 | User Agent 判断输出术语密度过高时 | 原始输出 + 用户画像 | 适配后输出 |
| **Verifier** | 事实核查与逻辑验证 | Plan/文档中包含具体主张时 | 主张列表 | 验证结果 + 不确定性标注 |

#### 6.4.2 交互隔离规则

```
┌─────────────────────────────────────────────────┐
│  用户                                            │
│    ↕  唯一交互通道                                │
│  前台 User Agent                                 │
│    │                                             │
│    ├── 需要查资料 ──→ Researcher ──→ 返回结果     │
│    ├── 需要细化步骤 ──→ Planner  ──→ 返回细化步骤  │
│    ├── 需要生成文档 ──→ Writer   ──→ 写入userspace │
│    │                                             │
│    ├── 所有后台输出 ──→ Reviewer（强制通过）       │
│    ├── 术语过多时   ──→ Translator（自动降维）     │
│    └── 有具体主张   ──→ Verifier（标记不确定性）   │
│                                                   │
│  ⛔ 用户永远不会看到 Researcher/Planner/Writer/     │
│     Reviewer/Translator/Verifier 的原始输出        │
│  ⛔ 这些 Agent 不向用户发送消息                     │
│  ✅ User Agent 合成所有后台结果后，用自己的话呈现    │
└─────────────────────────────────────────────────┘
```

#### 6.4.3 MVP 实现策略（渐进式）

**MVP 阶段（当前）**：
- User Agent = 单次 `chat()` 调用，system prompt 包含全部 Skills
- 其他 Agent 不存在，所有能力由 User Agent 一次性完成
- 架构预留 Multi-Agent 接口，但不实现

**V1.5 阶段（引入 Multi-Agent）**：
- User Agent 仍为单次 `chat()`，但遇到特定任务时调用内部函数
- 内部函数触发并行 `chat()` 调用到 Researcher/Planner/Writer
- Reviewer 串行执行，审查所有输出后方可发送给用户
- Translator 在 User Agent 返回前做最后一道术语降维

**V2.0 阶段（完整 Agent 集群）**：
- 每个 Agent 独立持久化 + 会话状态
- Agent 间通过标准化 JSON 协议通信
- 支持 Agent 之间的反驳与协商
- 用户可选择性查看后台 Agent 的推理过程（透明模式）

#### 6.4.4 技术预留

```ts
// lib/agents.ts（V1.5+ 实现）
type AgentRole = "user" | "researcher" | "planner" | "writer" | "reviewer" | "translator" | "verifier";

type AgentTask = {
  id: string;
  role: AgentRole;
  input: string;
  context: { profile: UserProfileState; plan?: PlanState };
};

type AgentResult = {
  taskId: string;
  role: AgentRole;
  output: string;
  confidence: number;
  needsReview: boolean;
};

// 核心调度函数
async function dispatch(task: AgentTask): Promise<AgentResult>;
async function review(result: AgentResult): Promise<AgentResult>;
async function translate(result: AgentResult, profile: UserProfileState): Promise<AgentResult>;

// MVP 阶段为空实现
// V1.5+ 实现内部 chat() 调用分发
```

**文件预留**：
```
src/lib/
├── agents.ts         # 🟡 预留 —— Agent 调度框架（MVP 空实现）
├── ai-provider.ts    # 保留不变
├── ai-triage.ts      # 🟢 MVP 使用，V1.5 重构为调用 agents.ts
```

---

## 七、迁移评估

### 7.1 保留不动

| 文件 | 原因 |
|------|------|
| `ai-provider.ts` | 裸 fetch 层工作正常 |
| `triage.ts` | 规则 fallback，不删 |
| `route-plan.ts` | 逻辑可被 Plan 生成复用 |
| `triage-types.ts` | 基础类型全部有效，只追加不删 |
| `prompt_templates/*.md` | 全部对齐 PRD |
| `globals.css` | CSS 变量体系保留 |
| `layout.tsx` | 只改 metadata |

### 7.2 需要修改

| 文件 | 改动 |
|------|------|
| `ai-triage.ts` | 拆成 `profileAgent()`, `planAgent()`, `docAgent()` 三个函数 |
| `storage.ts` | 加 `chatSessionKey` |
| `triage-types.ts` | 追加 `ChatMessage`, `UserProfileState`, `PlanState`, `DocState`, `Phase` |

### 7.3 需要新建

| 文件 | 说明 |
|------|------|
| `page.tsx` | 重写为 ChatPage |
| `api/chat/route.ts` | 核心对话端点 |
| `api/userspace/[sessionId]/[filename]/route.ts` | 用户空间文件预览 |
| `api/admin/review/route.ts` | 人工审核列表/详情/标注 |
| `chat-panel.tsx` | 对话面板 |
| `chat-message.tsx` | 消息气泡 |
| `chat-input.tsx` | 输入框 |
| `plan-panel.tsx` | Plan 展示面板 |
| `profile-card.tsx` | 画像卡片 |
| `doc-panel.tsx` | 文档预览面板 |
| `userspace.ts` | 用户空间文件读写 |
| `skills.ts` | Skills 加载与注入 |
| `agents.ts` | 🟡 预留 —— Multi-Agent 调度框架（MVP 空实现） |
| `skills/*.md` | 10 个科学方法论 Skill 文档 |
| `choice-buttons.tsx` | 结构化选项按钮组 |
| `file-list.tsx` | 用户空间文件列表 |
| `plan-steps.tsx` | Plan 步骤拆解组件 |
| `rich-doc-view.tsx` | Markdown → 富文本渲染 |

### 7.4 可以删除（新架构不需要）

| 文件 | 原因 |
|------|------|
| `intake-form.tsx` | 表单改为对话入口 |
| `result-view.tsx` | 结果页融入 Plan 面板 |
| `route-plan-view.tsx` | 路线页融入 Plan 面板 |
| `app/intake/page.tsx` | 不再需要独立路由 |
| `app/result/page.tsx` | 不再需要独立路由 |
| `app/route-plan/page.tsx` | 不再需要独立路由 |
| `api/triage/intake/route.ts` | 被 `/api/chat` 替代 |
| `api/triage/route.ts` | 被 `/api/chat` 替代 |
| `api/triage/route-plan/route.ts` | 被 `/api/chat` 内部 Plan 逻辑替代 |
| `api/generate-answer/route.ts` | 被 `/api/chat` 替代 |
| `api/recommend-service/route.ts` | 被 `/api/chat` 替代 |

---

## 八、验收标准（来自 PRD §13）

### 8.1 核心闭环验收

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 用户不需要填表单，一句话开始 | 打开页面 → 看到对话框 → 输入 |
| 2 | 系统识别至少 4 个画像维度 | profile 对象含 ≥4 字段（目标 ≥6 字段达到 user_confirmed） |
| 3 | 系统主动追问（目标模糊时不直接输出方案） | 输入模糊话题 → 收到追问而非 Plan |
| 4 | Plan 包含 7 项（画像+判断+逻辑+路径+步骤+风险+下一步） | plan 对象逐项检查 |
| 5 | 展示判断逻辑（为什么这样判断用户/为什么推荐这条路径） | PlanPanel 显示 systemLogic 和 reason 字段 |
| 6 | 文档预览不显示 Markdown 源码 | 富文本渲染验证 |
| 7 | 手机端可用 | Chrome DevTools 移动模式测试 |
| 8 | 保存用户画像和进度，刷新后恢复 | 刷新页面 → 对话历史/画像/Plan 不丢失 |

### 8.2 交互验收

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 用户能通过自然语言开始 | 输入任意中文 → 系统正常响应 |
| 2 | 系统能主动追问 | 输入模糊问题 → 返回 questions[] 含 ≥1 个选项 |
| 3 | 用户能选择：更简单/更专业/拆开讲 | PlanPanel 内网某步骤 → 弹出 4 个操作按钮 |
| 4 | Plan 能被清晰展示 | 独立面板，非聊天气泡内长文本 |
| 5 | 文档预览不显示 Markdown 源码 | 标题/列表/引用/重点内容格式正确 |
| 6 | 关键操作 ≤2 次点击 | 输入→收到追问→点击选项（2 步进入核心流程） |
| 7 | 术语可解释 | 专业术语附带人话解释或悬停 tooltip |

### 8.3 画像验收

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 系统识别 ≥6 个画像维度达到 user_confirmed | profile.md 中 ≥6 字段 confidence=1.0 |
| 2 | 系统能说明判断依据 | PlanState.reason 或 systemLogic 字段非空 |
| 3 | 用户能纠正画像 | 输入"我不是学生" → 画像更新 + 确认卡片弹出 |
| 4 | 修正后系统能调整输出 | 修正画像后 → Plan 标记为"待重新生成"

### 8.4 Plan 验收

Plan 必须逐项包含：用户画像摘要、当前问题判断、系统判断逻辑、推荐路径、可执行步骤（≥3 条）、风险提示（≥2 条）、下一步选择（≥2 个）。

### 8.5 文档展示验收

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 文档内容显示为正常富文本 | 无 Markdown 源码符号 |
| 2 | 不出现乱码 | 中文正常显示 |
| 3 | 标题/列表/引用/重点内容格式正确 | 视觉检查 |
| 4 | 用户能区分原文、修改项和新增内容 | 版本对比视图检查 |

### 8.6 多端适配验收

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 手机端可读 | Chrome DevTools iPhone SE 模式 |
| 2 | 电脑端不拥挤 | 1920×1080 视口 |
| 3 | 平板端布局合理 | iPad 横竖屏切换 |
| 4 | Plan 区和文档区可以清楚切换或展开 | 点击切换流畅，无布局抖动 |

---

*文档版本：v2.0 | 基于 PRD `人人都能做科研_mvp_prd_审查版.md` | 经过 5 轮交叉验证*

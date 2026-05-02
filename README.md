# Research-Triage（科研课题分诊台）

> AI for Science：让每个人都知道如何开始科研。  
> 当前阶段定位：**工程开发优先**，用于帮助开发者快速理解、运行、调试与扩展系统。

## 1. 项目目标

Research-Triage 是一个基于 Next.js 的科研问题分诊系统，核心能力包括：

- 将用户的科研想法进行结构化拆解与分流。
- 生成“继续追问 / 推荐服务 / 直接回答 / 规划路径”等结果。
- 提供多段式 Prompt 工作流（输入标准化、分类、路由、质量检查等）。

简言之：这是一个“科研任务入口层 + AI 编排层 + 结果展示层”的应用。

---

## 2. 技术栈

- **框架**：Next.js（App Router）
- **语言**：TypeScript
- **前端**：React 组件（`src/components`）
- **后端接口**：Next.js Route Handlers（`src/app/api/**/route.ts`）
- **AI 编排**：`src/lib` 内封装 provider 与 triage 流程
- **Prompt 模板**：`prompt_templates/*.md`

---

## 3. 目录结构（开发重点）

```text
src/
  app/
    api/
      triage/
        route.ts                # 主分诊入口
        intake/route.ts         # intake 子流程
        route-plan/route.ts     # 路径规划子流程
      generate-answer/route.ts  # 答案生成
      recommend-service/route.ts# 服务推荐
    intake/page.tsx             # 需求录入页
    result/page.tsx             # 结果页
    route-plan/page.tsx         # 路径规划页
    page.tsx                    # 首页

  components/
    intake-form.tsx
    result-view.tsx
    plan-card.tsx
    route-plan-view.tsx

  lib/
    ai-provider.ts              # LLM provider 适配
    ai-triage.ts                # AI 分诊编排
    triage.ts                   # 业务分诊逻辑
    route-plan.ts               # 路径规划逻辑
    triage-types.ts             # 类型定义
    storage.ts                  # 存储/会话辅助

prompt_templates/
  *.md                          # 分阶段 Prompt 模板
```

---

## 4. 本地开发

### 4.1 环境要求

- Node.js 18+
- npm 9+

### 4.2 安装依赖

```bash
npm install
```

### 4.3 启动开发服务器

```bash
npm run dev
```

默认访问：<http://localhost:3000>

### 4.4 生产构建与运行

```bash
npm run build
npm run start
```

---

## 5. 环境变量（建议）

请在项目根目录创建 `.env.local`，至少配置 AI Provider 所需密钥。由于当前 Provider 可能演进，请以 `src/lib/ai-provider.ts` 中读取字段为准。

建议做法：

1. 打开 `src/lib/ai-provider.ts`，确认读取了哪些 `process.env.*`。
2. 在 `.env.local` 中逐项补齐。
3. 本地先通过 `/api/triage/route` 最小请求验证连通性。

---

## 6. 主要 API（面向联调）

以下接口均为 Next.js Route Handler：

- `POST /api/triage`
  - 主分诊入口，返回路由决策与结果对象。
- `POST /api/triage/intake`
  - intake 阶段的处理逻辑。
- `POST /api/triage/route-plan`
  - 生成科研执行路径（Plan）。
- `POST /api/generate-answer`
  - 生成面向用户的答案文本。
- `POST /api/recommend-service`
  - 推荐下一步服务或能力模块。

联调建议：优先跑通 `POST /api/triage`，再分拆验证子接口。

---

## 7. Prompt 工作流说明

`prompt_templates/` 下模板按职责拆分，便于工程化维护：

- `input_normalizer.md`：输入规范化
- `triage_classifier.md`：问题分诊分类
- `response_router.md`：输出路由
- `need_clarifier.md`：补充追问
- `service_recommender.md`：服务推荐
- `answer_generator.md`：答案生成
- `quality_checker.md`：质量检查

### 维护建议

- 每次改 Prompt 时，附带“预期行为变更说明 + 示例输入输出”。
- 将 Prompt 变更与 `src/lib/ai-triage.ts` 的解析逻辑一起 review，避免字段漂移。

---

## 8. 测试与调试

仓库内提供了面向 DeepSeek 的调试脚本：

- `scripts/test-deepseek.ts`
- `scripts/test-deepseek-simple.js`

可用于快速验证模型连接与最小调用链路。建议在本地配置好环境变量后执行。

此外，建议增加：

- API 层契约测试（请求/响应 JSON schema）。
- Prompt 输出稳定性测试（关键字段快照）。
- 端到端流程测试（从 intake 到 result）。

---

## 9. 开发约定（当前阶段）

- 类型优先：新增字段先更新 `triage-types.ts`。
- API 兼容：对前端消费字段保持向后兼容。
- Prompt 改动最小化：每次只改一个职责模板，便于回归。
- 先可观测再优化：关键节点打印结构化日志（注意脱敏）。

---

## 10. 里程碑建议

短期（开发可用）建议优先级：

1. 固化 triage 主链路返回协议。
2. 加入基础错误码与错误分类。
3. 建立最小自动化测试（API + Prompt 解析）。
4. 接入轻量观测（请求耗时、模型失败率、重试率）。

---

## 11. 分支说明

当前开发分支已作为主线候选，建议后续以 `main` 作为默认集成分支，功能开发通过 feature 分支合并进入主线。


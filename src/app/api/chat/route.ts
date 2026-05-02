import { NextResponse } from "next/server";

import { chat, type ChatMsg } from "../../../lib/ai-provider";
import {
  createEmptyProfile,
  getDetectedFields,
  getReliableFields,
  isProfileReady,
  profileToMarkdown,
  toAPIState,
  updateField,
  type UserProfileMemory,
} from "../../../lib/memory";
import { buildSystemPrompt } from "../../../lib/skills";
import { getManifest, readFile, savePlan, saveProfile } from "../../../lib/userspace";
import type { ChatMessage, Phase, PlanState, UserProfileState } from "../../../lib/triage-types";

// ─── In-memory session store ──────────────────────────────────────

const sessions = new Map<
  string,
  {
    messages: ChatMessage[];
    memory: UserProfileMemory;
    phase: Phase;
    plan?: PlanState;
  }
>();

// ─── Helpers ──────────────────────────────────────────────────────

function parseJsonFromText(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* */ }
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]) as Record<string, unknown>; } catch { /* */ }
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>; } catch { /* */ }
  }
  // Last resort: try to fix truncated JSON by closing unclosed braces
  if (first >= 0) {
    const excerpt = text.slice(first);
    // Count open/close brace delta and append missing closes
    let depth = 0;
    for (const ch of excerpt) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth > 0) {
      const fixed = excerpt + "}".repeat(depth);
      try { return JSON.parse(fixed) as Record<string, unknown>; } catch { /* */ }
    }
  }
  return null;
}

/** Fallback: extract structured options from non-JSON AI response. */
function extractQuestionsFromText(text: string): string[] {
  const questions: string[] = [];

  // Pattern: "1. **标题**：描述内容"
  const numberedRe = /^\d+\.\s+\*{0,2}([^*\n]+)\*{0,2}[：:]\s*(.+)$/gm;
  let match;
  while ((match = numberedRe.exec(text)) !== null) {
    questions.push(`${match[1].trim()}：${match[2].trim()}`);
  }

  // Pattern: "- **标题**：描述" or "- 标题：描述"
  if (questions.length === 0) {
    const bulletRe = /^[-*]\s+\*{0,2}([^*\n]+)\*{0,2}[：:]\s*(.+)$/gm;
    while ((match = bulletRe.exec(text)) !== null) {
      questions.push(`${match[1].trim()}：${match[2].trim()}`);
    }
  }

  return questions.slice(0, 5);
}

function splitInlineSubOptions(question: string): string[] {
  const normalized = question
    .replace(/\s+/g, " ")
    .replace(/([:：；;])\s*([A-D])\./g, "$1\n$2.")
    .replace(/([:：；;])\s*([A-D])[)）]/g, "$1\n$2.")
    .trim();

  const parts = normalized
    .split(/\n(?=[A-D]\.)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [question.trim()];

  const stemMatch = normalized.match(/^(.*?)(?:[:：]\s*)?(?=\n?[A-D]\.)/);
  const stem = stemMatch?.[1]?.trim().replace(/[：:]$/, "") ?? "";
  if (!stem) return [question.trim()];

  const results = parts
    .map((part) => part.replace(/^[A-D]\.\s*/, "").trim())
    .filter((part) => part !== stem && part !== `${stem}：` && part !== `${stem}:`)
    .filter(Boolean)
    .map((part) => `${stem}：${part}`);

  return results.length > 0 ? results : [question.trim()];
}

function isQuestionStemOnly(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length < 3) return false;
  if (!/[？?]$/.test(trimmed)) return false;
  return !/[；;。.!！]/.test(trimmed.slice(0, -1));
}

function normalizeQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const flattened = raw
    .flatMap((item) => {
      if (typeof item !== "string") return [];
      return splitInlineSubOptions(item);
    })
    .map((item) => item.trim())
    .filter(Boolean);

  const deduped: string[] = [];
  for (const item of flattened) {
    if (!deduped.includes(item)) deduped.push(item);
  }

  const withoutStemOnly = deduped.filter((item, index, arr) => {
    if (!isQuestionStemOnly(item)) return true;
    return !arr.some((candidate) => candidate !== item && candidate.startsWith(item.replace(/[？?]$/, "")));
  });

  return withoutStemOnly.slice(0, 6);
}

/** Extract a clean reply from non-JSON text by removing question lists. */
function extractReplyFromText(text: string): string {
  // Take everything before the first numbered/bulleted option
  const splitAt = text.search(/\n\s*\d+\.\s+\*{0,2}|\n\s*[-*]\s+\*{0,2}/);
  if (splitAt > 0) return text.slice(0, splitAt).trim();
  return text.trim();
}

/** Parse plan data from markdown output (fallback when JSON fails). */
function parsePlanFromMarkdown(text: string, currentVersion: number): PlanState | null {
  const extract = (pattern: RegExp): string => {
    const m = text.match(pattern);
    return m?.[1]?.trim() ?? "";
  };

  // Try to find plan sections by common markdown headers
  const userProfile = extract(/画像[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || extract(/用户画像[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || "";

  const problemJudgment = extract(/问题[判断分解][^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || extract(/当前状态[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || "";

  const systemLogic = extract(/系统[^\n]*逻辑[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || extract(/判断逻辑[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || extract(/核心假设[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || "";

  const recommendedPath = extract(/路径[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || extract(/推荐[^\n]*路径[^\n]*\n+(.+?)(?=\n##|\n---|\n  |$)/s)
    || "";

  // Extract numbered steps
  const steps: string[] = [];
  const stepsSection = text.match(/步骤[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n###|$)/);
  if (stepsSection) {
    const stepLines = stepsSection[1].match(/^\d+\.\s+(.+)$/gm);
    if (stepLines) {
      for (const line of stepLines) {
        steps.push(line.replace(/^\d+\.\s+/, "").trim());
      }
    }
  }

  // Fallback: look for any numbered list in the last half of the text
  if (steps.length === 0) {
    const allSteps = text.match(/^\d+\.\s+(.+)$/gm);
    if (allSteps) {
      for (const line of allSteps.slice(-8)) {
        steps.push(line.replace(/^\d+\.\s+/, "").trim());
      }
    }
  }

  // Extract risks
  const risks: string[] = [];
  const riskSection = text.match(/风险[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n###|$)/);
  if (riskSection) {
    const riskLines = riskSection[1].match(/^[-*]\s+(.+)$/gm);
    if (riskLines) {
      for (const line of riskLines.slice(0, 5)) {
        risks.push(line.replace(/^[-*]\s+/, "").trim());
      }
    }
  }

  // Must have at least some content to be a valid plan
  if (!userProfile && !problemJudgment && steps.length === 0) return null;

  return {
    userProfile: userProfile || extract(/#\s*(.+?)\n/),
    problemJudgment: problemJudgment || "基于对话历史生成",
    systemLogic: systemLogic || "参阅上方详细分析",
    recommendedPath: recommendedPath || "参阅步骤列表",
    actionSteps: steps.length > 0 ? steps : ["根据上方分析执行"],
    riskWarnings: risks.length > 0 ? risks : ["请确认每个步骤的前提条件"],
    nextOptions: ["更简单", "更专业", "拆开讲", "换方向"],
    version: currentVersion,
    isCurrent: true,
  };
}

function planToMarkdown(plan: PlanState): string {
  return `# 科研探索计划 v${plan.version}

## 用户画像
${plan.userProfile}

## 问题判断
${plan.problemJudgment}

## 系统逻辑
${plan.systemLogic}

## 推荐路径
${plan.recommendedPath}

## 步骤
${plan.actionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## 风险
${plan.riskWarnings.map((r) => `- ${r}`).join("\n")}

## 下一步选项
${plan.nextOptions.map((o) => `- ${o}`).join("\n")}
`;
}

function persistPlan(sessionId: string, plan: PlanState): void {
  savePlan(sessionId, plan.version, planToMarkdown(plan), plan.modifiedReason);
}

function restoreLatestPlan(sessionId: string, manifest: ReturnType<typeof getManifest>): PlanState | undefined {
  const latest = manifest
    .filter((f) => f.type === "plan")
    .sort((a, b) => b.version - a.version)[0];

  if (!latest) return undefined;

  const raw = readFile(sessionId, latest.filename);
  if (!raw) return undefined;

  return parsePlanFromMarkdown(raw, latest.version) ?? {
    userProfile: "参见历史计划文档",
    problemJudgment: "已从 userspace 恢复历史计划",
    systemLogic: "服务端会话重建时恢复了最新计划文件",
    recommendedPath: "请打开右侧文件列表查看完整内容",
    actionSteps: ["查看历史计划", "继续对话调整计划"],
    riskWarnings: ["服务重启后仅恢复计划文档摘要，完整对话历史不可用"],
    nextOptions: ["更简单", "更专业", "拆开讲", "换方向"],
    version: latest.version,
    isCurrent: true,
  };
}

/** Normalize action steps to string array regardless of input format. */
function normalizeSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown): string => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      // Common patterns from AI: {step, time}, {step, description, assumption, verification}
      const main = obj.step ?? obj.description ?? obj.title ?? obj.name ?? obj.content ?? "";
      const time = obj.time ?? obj.duration ?? "";
      const text = String(main);
      return time ? `${text}（${time}）` : text;
    }
    return String(item);
  });
}

function normalizeRisks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown): string => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      return String(obj.risk ?? obj.description ?? obj.title ?? obj.content ?? JSON.stringify(item));
    }
    return String(item);
  });
}

/** Normalize plan field names (AI may use different naming conventions). */
function extractPlanFromParsed(parsed: Record<string, unknown>, currentVersion: number): PlanState | null {
  // The plan might be at top level or nested under "plan"
  const raw = (parsed.plan && typeof parsed.plan === "object")
    ? parsed.plan as Record<string, unknown>
    : parsed;

  // Try multiple field name patterns
  const getString = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] && typeof raw[k] === "string") return raw[k] as string;
    }
    return "";
  };

  const getArray = (...keys: string[]) => {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k] as unknown[];
    }
    return [];
  };

  const userProfile = getString("userProfile", "user_profile", "summary", "用户画像");
  const problemJudgment = getString("problemJudgment", "problem_judgment", "problem", "问题判断");
  const systemLogic = getString("systemLogic", "system_logic", "logic", "系统逻辑", "判断逻辑");
  const recommendedPath = getString("recommendedPath", "recommended_path", "path", "推荐路径", "路径");
  const rawSteps = getArray("actionSteps", "action_steps", "steps", "行动步骤", "步骤");
  const rawRisks = getArray("riskWarnings", "risk_warnings", "risks", "风险提示", "风险");
  const rawOptions = getArray("nextOptions", "next_options", "options", "下一步");

  const actionSteps = normalizeSteps(rawSteps);
  const riskWarnings = normalizeRisks(rawRisks);

  // Must have at least some substance
  if (!userProfile && !problemJudgment && actionSteps.length === 0) return null;

  return {
    userProfile: userProfile || "（参见对话记录）",
    problemJudgment: problemJudgment || "（参见对话记录）",
    systemLogic: systemLogic || "（参见上方分析）",
    recommendedPath: recommendedPath || "（参见步骤列表）",
    actionSteps: actionSteps.length > 0 ? actionSteps : ["根据上方分析执行"],
    riskWarnings: riskWarnings.length > 0 ? riskWarnings : ["请确认每个步骤的前提条件"],
    nextOptions: normalizeSteps(rawOptions).length > 0
      ? normalizeSteps(rawOptions)
      : ["更简单", "更专业", "拆开讲", "换方向"],
    version: currentVersion,
    isCurrent: true,
  };
}

function buildConversationMessages(
  systemPrompt: string,
  history: ChatMessage[],
  maxTurns = 30,
): ChatMsg[] {
  const msgs: ChatMsg[] = [{ role: "system", content: systemPrompt }];
  const recent = history.slice(-maxTurns);
  for (const m of recent) {
    if (m.role === "user" || m.role === "assistant") {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}

function buildFallbackTurn(phase: Phase, ready: boolean, hasPlan: boolean): { reply: string; questions: string[] } {
  if (phase === "greeting") {
    return {
      reply: "当前 AI 服务暂时不可用，我先用规则模式帮你进入科研分诊流程。",
      questions: [
        "我对AI和机器学习感兴趣",
        "我想研究社会现象或人类行为",
        "我对自然科学（物理/化学/生物）感兴趣",
        "我不太理解这些，帮我找方向",
      ],
    };
  }

  if (!ready) {
    return {
      reply: "当前 AI 服务暂时不可用，我需要先补齐几个关键画像字段，之后再生成计划。",
      questions: [
        "我是新手，希望从零开始解释",
        "我有一点基础，希望直接给我执行步骤",
        "我时间很紧，希望先给最小可交付方案",
        "我不太理解这些，帮我找方向",
      ],
    };
  }

  if (!hasPlan) {
    return {
      reply: "当前 AI 服务暂时不可用，画像已经基本明确，但生成 Plan 前还需要确认目标范围。",
      questions: [
        "我想先把问题收窄到一个最小研究问题",
        "我想优先得到一周内可完成的计划",
        "我想先确认最后要交付什么",
        "我不太理解这些，帮我找方向",
      ],
    };
  }

  return {
    reply: "当前 AI 服务暂时不可用，已有 Plan 已保留在右侧面板和文件列表中。",
    questions: [
      "等服务恢复后帮我把 Plan 调得更简单",
      "等服务恢复后帮我把 Plan 调得更专业",
      "等服务恢复后帮我拆开讲某一步",
      "我不太理解这些，帮我找方向",
    ],
  };
}

function phaseLabel(phase: Phase): string {
  const labels: Record<Phase, string> = {
    greeting: "开场引导",
    profiling: "画像识别",
    clarifying: "问题收敛",
    planning: "Plan 生成",
    reviewing: "Plan 调整",
  };
  return labels[phase];
}

function buildProcessSummary({
  phase,
  nextPhase,
  memory,
  questions,
  plan,
  checklistPassed,
  fallback,
}: {
  phase: Phase;
  nextPhase: Phase;
  memory: UserProfileMemory;
  questions: string[];
  plan?: PlanState | null;
  checklistPassed?: boolean;
  fallback?: boolean;
}): string {
  const detected = getDetectedFields(memory).length;
  const reliable = getReliableFields(memory).length;
  const lines = [
    `- 阶段：${phaseLabel(phase)} -> ${phaseLabel(nextPhase)}`,
    `- 画像：已识别 ${detected}/10 个字段，可靠字段 ${reliable}/10 个`,
  ];

  if (fallback) {
    lines.push("- 处理：AI 调用失败，已切换为规则兜底选项");
  } else if (plan) {
    lines.push(`- 处理：生成或更新科研探索计划 v${plan.version}`);
    lines.push(`- 判断逻辑：${plan.systemLogic}`);
  } else if (phase === "clarifying") {
    lines.push(`- 前置检查：${checklistPassed ? "已通过，准备生成 Plan" : "仍需确认假设和范围"}`);
  } else if (phase === "profiling") {
    lines.push("- 处理：从用户回复中提取画像字段和当前卡点");
  } else {
    lines.push("- 处理：根据当前阶段生成下一步结构化选项");
  }

  if (questions.length > 0) {
    lines.push(`- 下一步：等待用户在 ${questions.length} 个选项中确认`);
  } else if (plan) {
    lines.push("- 下一步：用户可在右侧 Plan 面板继续调整");
  }

  return lines.join("\n");
}

/** Build a structured state block for the AI to read on every call. */
function buildStateContext(memory: UserProfileMemory, phase: Phase, plan?: PlanState): string {
  const fields = getReliableFields(memory);
  const ready = isProfileReady(memory);
  const planBlock = plan
    ? `
- 当前 Plan：v${plan.version}
- 当前 Plan 步骤：${plan.actionSteps.map((s, i) => `${i + 1}. ${s}`).join(" | ")}
- 当前 Plan 风险：${plan.riskWarnings.join(" | ")}`
    : "";

  return `## 当前状态
- 对话阶段：${phase}
- 画像就绪：${ready ? "是" : "否"}（可靠字段：${fields.length}个，需≥6）
- 已确认画像：${fields.map((f) => `${f}=${memory[f as keyof UserProfileState].value}`).join(" | ") || "无"}
- 研究方向：${memory.interestArea?.value || "未确认"}
- 当前卡点：${memory.currentBlocker?.value || "未确认"}${planBlock}`;
}

function buildChatSystemPrompt(memory: UserProfileMemory, phase: Phase, instruction: string, plan?: PlanState): string {
  const stateBlock = buildStateContext(memory, phase, plan);
  const skillsBlock = buildSystemPrompt("");
  return `${skillsBlock}

## 当前任务

${stateBlock}

${instruction}

⚠️ 输出格式：你必须且只能输出一行合法JSON。不是markdown、不是表格、不是文字说明。回复的第一个字符必须是{最后一个字符必须是}。任何其他格式都会导致系统无法工作。`;
}

// ─── Phase-specific task instructions ─────────────────────────────

const GREETING_INSTRUCTION = `你是「人人都能做科研」的科研启蒙引导者。用户刚刚进入系统。

你必须返回严格 JSON：
{
  "reply": "你的开场白（1-2句，不许包含问号或疑问句）",
  "questions": ["完整选项文本A", "完整选项文本B", "完整选项文本C", "我不太理解这些，帮我找方向"]
}

【reply 规则】
- reply 是陈述句，禁止出现问号、禁止出现"请告诉我""你能说说是吗"等追问语句
- reply 里不要塞问题 —— 所有追问必须放在 questions 数组里
- 示例（正确）："你好！我来帮你找到适合你的科研探索方向。你可以从下面的选项开始，也可以直接告诉我你的想法。"
- 示例（错误）："你好！你之前学过数字电路吗？"

【questions 规则】
- 每个选项是一句完整的、确定的话，用户点击即选中
- 禁止占位符文本（如"选项A""其他""请选择"）
- 必须包含"我不太理解这些，帮我找方向"作为最后一项（用户不知道怎么选时的逃生通道）
- 示例（正确）：["我对AI和机器学习感兴趣", "我想研究社会现象或人类行为", "我对自然科学（物理/化学/生物）感兴趣", "我不太理解这些，帮我找方向"]
- 示例（错误）：["选项A", "选项B", "其他"]

【最终指令】
你必须且只能输出一行合法JSON。不要任何前置解释、不要markdown、不要代码块标记。回复必须以{开头、以}结尾。`;

const PROFILING_INSTRUCTION = `你是「人人都能做科研」的科研启蒙引导者，正在了解用户。
基于对话历史，从用户话语中提取画像信息，同时继续引导对话。

你必须返回严格 JSON：
{
  "reply": "你的回复文本",
  "questions": ["完整选项A", "完整选项B", "完整选项C", "我不太理解这些，帮我找方向"],
  "profileUpdates": [
    {"field": "字段名", "value": "值", "confidence": 0.3-1.0}
  ]
}

可提取的字段名：
- ageOrGeneration（年龄段/时代背景）
- educationLevel（教育水平）
- toolAbility（工具使用能力）
- aiFamiliarity（AI熟悉程度）
- researchFamiliarity（科研理解程度）
- interestArea（兴趣方向）
- currentBlocker（当前卡点）
- deviceAvailable（可用设备）
- timeAvailable（可用时间）
- explanationPreference（偏好解释风格）

【reply 规则】
- reply 是给用户的简短回应（1-3句话）
- 禁止在 reply 中嵌入疑问句或追问（所有追问放 questions 里）
- 先回应用户刚说的内容，再引导用户看下方选项
- reply 可以简单总结当前对用户的理解

【questions 规则】
- 2-4个完整、确定的选项，每个选项是一句用户点击即选中的完整句子
- 选项必须互斥、覆盖用户可能的选择范围
- 禁止占位符文本（如"选项C""其他""请选择"）
- 必须包含"我不太理解这些，帮我找方向"作为最后一项
- 示例（正确）：["我完全没接触过，从零开始", "我了解一些基础概念", "我有一定实践经验", "我不太理解这些，帮我找方向"]
- 示例（正确）：["我想先搞清楚这是什么", "我想知道具体怎么做", "我时间很紧，要最快路径", "我不太理解这些，帮我找方向"]
- 示例（错误）：["选项A", "选项B", "其他"]

【profileUpdates 规则】
- 每次提取你有把握的字段即可，不需要一次全提取
- confidence: 0.3=猜测, 0.5=AI推断, 0.7=用户暗示, 1.0=用户明确说了
- 不确定的字段不要填，留到下一轮通过 questions 追问
- profileUpdates 可以为空数组 []

【最终指令】
你必须且只能输出一行合法JSON。不要任何前置解释、不要markdown、不要代码块标记。回复必须以{开头、以}结尾。`;

const CLARIFYING_INSTRUCTION = `你是「人人都能做科研」的科研启蒙引导者。用户画像已基本确立，现在进入"问题收敛"阶段。

在生成 Plan 之前，你必须逐项检查以下清单。任一项未通过，不得生成 Plan。

【前置检查清单】
1. 用户身份已确认？
2. 用户目标已收敛为一个明确问题？
3. 用户工具能力已确认？
4. 用户时间约束已明确？
5. 用户期望的交付物已明确？
6. 存在任何你做出的隐含假设？→ 必须在 reply 中列出每个假设
7. 用户问题是否过大（超出工具/时间能力）？
8. 用户想法在当前约束下是否可执行？
9. 用户是否要求跨越过多阶段？

你必须返回严格 JSON：
{
  "reply": "列出待确认的假设，或说明所有项已通过",
  "questions": ["追问选项A", "追问选项B", "我不太理解这些，帮我找方向"],
  "checklistPassed": false
}

规则：
- checklistPassed=true 时，questions 可为空数组
- 列出假设时，每个假设渲染为一个可确认项
- 继续追问时，选项具体到缺失的信息
- 必须包含"我不太理解这些，帮我找方向"作为最后一个 question

【最终指令】
你必须且只能输出一行合法JSON。回复必须以{开头、以}结尾。`;

const PLAN_JSON_SCHEMA = `{
  "reply": "一句简短回复，提示用户查看右侧 Plan 面板",
  "plan": {
    "userProfile": "用户画像摘要",
    "problemJudgment": "当前问题判断",
    "systemLogic": "系统判断逻辑，必须说明关键假设和证据边界",
    "recommendedPath": "推荐路径",
    "actionSteps": ["步骤1：具体动作、时限、验证方式", "步骤2：..."],
    "riskWarnings": ["风险1", "风险2"],
    "nextOptions": ["更简单", "更专业", "拆开讲", "换方向"]
  }
}`;

const PLANNING_INSTRUCTION = `你是「人人都能做科研」的科研启蒙引导者。用户画像已确认，问题已收敛，现在生成科研探索 Plan。

你必须返回严格 JSON：
${PLAN_JSON_SCHEMA}

规则：
- 所有建议以假设形式呈现："如果按 X 路线走，预期 Y，验证方法是 Z"
- 根据用户画像调整语言复杂度
- 不确定的地方标注"推断中"
- actionSteps 必须是 3-7 个可执行步骤，每步包含动作、时限、验证方法
- riskWarnings 必须直接对应用户当前约束
- reply 不得重复完整 Plan 内容`;

const REVIEWING_INSTRUCTION = `你是「人人都能做科研」的科研启蒙引导者。用户正在挑战或调整已有 Plan。

你必须根据用户最新反馈，重新生成一个新的 Plan 版本，并返回严格 JSON：
${PLAN_JSON_SCHEMA}

规则：
- 先判断用户是在要求"更简单"、"更专业"、"拆开讲"还是"换方向"
- 只根据用户反馈调整必要部分，但返回完整 Plan
- systemLogic 必须说明本次修改相对上一版改变了什么
- actionSteps 仍必须具体可执行
- reply 用一句话说明 Plan 已按反馈更新`;

// ─── Route handler ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, sessionId } = body as { message?: string; sessionId?: string };

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: "缺少 message 或 sessionId" },
        { status: 400 },
      );
    }

    // Get or create session (with disk recovery)
    let session = sessions.get(sessionId);

    if (!session) {
      // Try to recover from userspace disk
      const manifest = getManifest(sessionId);
      const hasFiles = manifest.length > 0;

      if (hasFiles) {
        // Rebuild session from disk data
        session = {
          messages: [],
          memory: createEmptyProfile(),
          phase: "profiling", // was past greeting
        };

        // Try to restore profile from disk if exists
        const profileRaw = readFile(sessionId, "profile.md");
        if (profileRaw) {
          // Rebuild a basic profile from markdown
          const pmdMatch = profileRaw.match(/- [✅🔍❓] \*\*(.+?)\*\*: (.+)/g);
          if (pmdMatch) {
            for (const line of pmdMatch) {
              const m = line.match(/- [✅🔍❓] \*\*(.+?)\*\*: (.+)/);
              if (m) {
                const labelMap: Record<string, keyof UserProfileState> = {
                  "年龄段": "ageOrGeneration",
                  "教育水平": "educationLevel",
                  "工具能力": "toolAbility",
                  "AI 熟悉度": "aiFamiliarity",
                  "科研理解度": "researchFamiliarity",
                  "兴趣方向": "interestArea",
                  "当前卡点": "currentBlocker",
                  "可用设备": "deviceAvailable",
                  "可用时间": "timeAvailable",
                  "解释偏好": "explanationPreference",
                };
                const key = labelMap[m[1]];
                const value = m[2]?.replace(/\s*\(未识别\)/, "").trim();
                const isConfirmed = line.startsWith("- ✅") || line.startsWith("- ●");
                if (key && value && key in session.memory) {
                  session.memory = updateField(
                    session.memory, key, value,
                    isConfirmed ? "user_confirmed" : "deduced",
                    isConfirmed ? 1.0 : 0.7,
                  );
                }
              }
            }
          }
        }

        const restoredPlan = restoreLatestPlan(sessionId, manifest);
        if (restoredPlan) {
          session.plan = restoredPlan;
          session.phase = "reviewing";
        } else if (isProfileReady(session.memory)) {
          session.phase = "clarifying";
        } else {
          session.phase = "profiling";
        }

        console.log(`[api/chat] Session ${sessionId.slice(0, 8)} recovered from disk (phase=${session.phase})`);
      } else {
        // Fresh session
        session = {
          messages: [],
          memory: createEmptyProfile(),
          phase: "greeting",
        };
      }

      sessions.set(sessionId, session);
    }

    // Append user message
    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    const phaseAtStart = session.phase;

    // Determine task instruction based on phase
    let instruction: string;
    if (session.phase === "greeting") {
      instruction = GREETING_INSTRUCTION;
    } else if (session.phase === "planning") {
      instruction = PLANNING_INSTRUCTION;
    } else if (session.phase === "reviewing") {
      instruction = REVIEWING_INSTRUCTION;
    } else if (session.phase === "clarifying") {
      instruction = CLARIFYING_INSTRUCTION;
    } else {
      instruction = PROFILING_INSTRUCTION;
    }

    const systemPrompt = buildChatSystemPrompt(session.memory, session.phase, instruction, session.plan);

    // Build multi-turn messages
    const aiMessages = buildConversationMessages(systemPrompt, session.messages);

    // Call AI (with generous token limit to prevent mid-JSON truncation)
    let aiResult: Awaited<ReturnType<typeof chat>>;
    try {
      aiResult = await chat({ messages: aiMessages, temperature: 0.4, maxTokens: 4096 });
    } catch (err) {
      const fallback = buildFallbackTurn(session.phase, isProfileReady(session.memory), !!session.plan);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: fallback.reply,
        questions: fallback.questions,
        timestamp: Date.now(),
      };
      session.messages.push(assistantMsg);

      if (session.phase === "greeting") {
        session.phase = "profiling";
      }
      const process = buildProcessSummary({
        phase: phaseAtStart,
        nextPhase: session.phase,
        memory: session.memory,
        questions: fallback.questions,
        plan: session.plan,
        fallback: true,
      });

      const profileState = getDetectedFields(session.memory).length > 0
        ? toAPIState(session.memory)
        : undefined;
      const profileConfidence = profileState
        ? Object.fromEntries(
            Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
          )
        : undefined;

      console.warn("[api/chat] AI call failed, returned fallback:", err instanceof Error ? err.message : err);

      return NextResponse.json({
        reply: fallback.reply,
        questions: fallback.questions,
        process,
        profile: profileState,
        profileConfidence,
        phase: session.phase,
        plan: session.plan,
        _fallback: true,
      });
    }
    let parsed = parseJsonFromText(aiResult.content);

    // Retry once with explicit demand if first attempt failed during clarifying
    // (planning phase accepts markdown, no retry needed)
    if (!parsed && session.phase === "clarifying") {
      console.warn("[api/chat] First parse failed in", session.phase, "— retrying with JSON demand");
      const retryMsgs: ChatMsg[] = [
        ...aiMessages,
        { role: "assistant" as const, content: aiResult.content },
        { role: "user" as const, content: "上一轮回复不是JSON。请严格按照JSON格式重新输出，以{开头以}结尾。" },
      ];
      aiResult = await chat({ messages: retryMsgs, temperature: 0.3, maxTokens: 4096 });
      parsed = parseJsonFromText(aiResult.content);
    }

    let reply: string;
    let questions: string[] = [];
    let profileState: UserProfileState | null = null;
    let profileConfidence: Record<string, number> | null = null;
    let planState: PlanState | null = null;
    let checklistPassed = false;

    if (parsed) {
      // Extract reply — might be "reply", "summary", or missing entirely
      reply = typeof parsed.reply === "string" ? parsed.reply :
              typeof parsed.summary === "string" ? parsed.summary : "";

      questions = normalizeQuestions(parsed.questions);

      // Try to extract plan from JSON response (handles any naming convention)
      const version = (session.plan?.version ?? 0) + 1;
      const extractedPlan = extractPlanFromParsed(parsed, version);
      if (extractedPlan && extractedPlan.actionSteps.length > 0) {
        planState = extractedPlan;
        if (session.phase === "reviewing") {
          planState.modifiedReason = message;
        }
        persistPlan(sessionId, planState);
        session.plan = planState;
      }

      // Apply profile updates if present
      if (Array.isArray(parsed.profileUpdates)) {
        for (const update of parsed.profileUpdates as Array<{
          field?: string;
          value?: string;
          confidence?: number;
        }>) {
          if (update.field && update.value && update.field in session.memory) {
            const conf = typeof update.confidence === "number" ? update.confidence : 0.5;
            const source = conf >= 1.0 ? "user_confirmed" as const :
                          conf >= 0.7 ? "deduced" as const : "inferred" as const;
            session.memory = updateField(
              session.memory,
              update.field as keyof UserProfileState,
              update.value,
              source,
              conf,
            );
          }
        }
      }

      // Always send current profile state when we have any data
      if (getDetectedFields(session.memory).length > 0) {
        const md = profileToMarkdown(session.memory);
        saveProfile(sessionId, md);
        profileState = toAPIState(session.memory);
        profileConfidence = Object.fromEntries(
          Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
        );
      }

      // Check for checklist result (clarifying phase)
      if (typeof parsed.checklistPassed === "boolean") {
        checklistPassed = parsed.checklistPassed;
      }

      if (session.phase === "clarifying" && checklistPassed && !planState) {
        const planningSystemPrompt = buildChatSystemPrompt(
          session.memory,
          "planning",
          PLANNING_INSTRUCTION,
          session.plan,
        );
        const planningMessages = buildConversationMessages(planningSystemPrompt, session.messages);
        aiResult = await chat({ messages: planningMessages, temperature: 0.4, maxTokens: 4096 });

        const planningParsed = parseJsonFromText(aiResult.content);
        const version = (session.plan?.version ?? 0) + 1;
        planState = planningParsed
          ? extractPlanFromParsed(planningParsed, version)
          : parsePlanFromMarkdown(aiResult.content, version);

        if (planState) {
          persistPlan(sessionId, planState);
          session.plan = planState;
          reply = typeof planningParsed?.reply === "string"
            ? planningParsed.reply
            : "Plan 已生成，可在右侧面板查看详情。";
          questions = [];
        }
      }
    } else {
      // AI didn't return valid JSON — fall back to text extraction
      reply = extractReplyFromText(aiResult.content);
      questions = normalizeQuestions(extractQuestionsFromText(aiResult.content));

      // Try to parse plan from markdown during plan-producing phases
      if (session.phase === "planning" || session.phase === "clarifying" || session.phase === "reviewing") {
        const version = (session.plan?.version ?? 0) + 1;
        const mdPlan = parsePlanFromMarkdown(aiResult.content, version);
        if (mdPlan && mdPlan.actionSteps.length > 0) {
          planState = mdPlan;
          if (session.phase === "reviewing") {
            planState.modifiedReason = message;
          }
          persistPlan(sessionId, planState);
          session.plan = planState;
        }
      }

      // Still save any existing profile to disk
      if (getDetectedFields(session.memory).length > 0) {
        const md = profileToMarkdown(session.memory);
        saveProfile(sessionId, md);
        profileState = toAPIState(session.memory);
        profileConfidence = Object.fromEntries(
          Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
        );
      }
      console.warn("[api/chat] AI returned non-JSON, extracted", questions.length, "questions, plan=", !!planState);
    }

    // If plan was generated (from JSON or markdown), force reply to be short
    if (planState) {
      reply = "✅ Plan 已生成，可在右侧面板查看详情。你可以继续对话来调整计划。";
      questions = []; // No follow-up questions when showing plan
    }

    // Append assistant message
    let nextPhase = session.phase;
    if (session.phase === "greeting") {
      nextPhase = "profiling";
    } else if (session.phase === "profiling" && isProfileReady(session.memory)) {
      nextPhase = "clarifying";
    } else if (session.phase === "clarifying" && planState) {
      nextPhase = "reviewing";
    } else if (session.phase === "clarifying" && checklistPassed) {
      nextPhase = "planning";
    } else if (session.phase === "planning" && planState) {
      nextPhase = "reviewing";
    } else if (session.phase === "reviewing") {
      nextPhase = "reviewing";
    }

    const process = buildProcessSummary({
      phase: phaseAtStart,
      nextPhase,
      memory: session.memory,
      questions,
      plan: planState,
      checklistPassed,
    });

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: reply,
      questions: questions.length > 0 ? questions : undefined,
      process,
      timestamp: Date.now(),
    };
    session.messages.push(assistantMsg);

    // Phase transitions
    session.phase = nextPhase;

    // Build response
    const response: {
      reply: string;
      questions?: string[];
      process?: string;
      profile?: UserProfileState;
      profileConfidence?: Record<string, number>;
      phase: Phase;
      plan?: PlanState;
    } = {
      reply,
      process,
      phase: session.phase,
    };

    if (questions.length > 0) {
      response.questions = questions;
    }
    if (profileState) {
      response.profile = profileState;
      if (profileConfidence) response.profileConfidence = profileConfidence;
    }
    if (planState) {
      response.plan = planState;
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? ` cause=${String(err.cause)}` : "";
    console.error(`[api/chat] ${msg}${cause}`);
    return NextResponse.json({ error: `${msg}${cause}` }, { status: 500 });
  }
}

import { getDetectedFields, getReliableFields, isProfileReady, type UserProfileMemory } from "./memory";
import { readFile, saveCodeFile, saveMarkdownDocument, savePlan } from "./userspace";
import type { ChatMessage, CodeFileArtifact, FileManifest, Phase, PlanState } from "./triage-types";
import type { ChatMsg } from "./ai-provider";

export function parseJsonFromText(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* ignore */ }
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]) as Record<string, unknown>; } catch { /* ignore */ }
  }

  for (const candidate of extractBalancedJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (isProtocolJson(parsed)) return parsed;
    } catch { /* ignore */ }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>; } catch { /* ignore */ }
  }
  if (first >= 0) {
    const excerpt = text.slice(first);
    let depth = 0;
    for (const ch of excerpt) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth > 0) {
      try { return JSON.parse(excerpt + "}".repeat(depth)) as Record<string, unknown>; } catch { /* ignore */ }
    }
  }
  return null;
}

function isProtocolJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return "reply" in obj
    || "questions" in obj
    || "profileUpdates" in obj
    || "checklistPassed" in obj
    || "plan" in obj
    || "codeFiles" in obj;
}

function extractBalancedJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === "{") depth++;
      if (ch === "}") depth--;

      if (depth === 0) {
        candidates.push(text.slice(start, i + 1));
        break;
      }
    }
  }

  return candidates;
}

export function extractQuestionsFromText(text: string): string[] {
  const questions: string[] = [];
  const numberedRe = /^\d+\.\s+\*{0,2}([^*\n]+)\*{0,2}[：:]\s*(.+)$/gm;
  let match;
  while ((match = numberedRe.exec(text)) !== null) {
    questions.push(`${match[1].trim()}：${match[2].trim()}`);
  }

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

export function normalizeQuestions(raw: unknown): string[] {
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

  return deduped
    .filter((item, _index, arr) => {
      if (!isQuestionStemOnly(item)) return true;
      return !arr.some((candidate) => candidate !== item && candidate.startsWith(item.replace(/[？?]$/, "")));
    })
    .slice(0, 6);
}

export function extractReplyFromText(text: string): string {
  const splitAt = text.search(/\n\s*\d+\.\s+\*{0,2}|\n\s*[-*]\s+\*{0,2}/);
  if (splitAt > 0) return text.slice(0, splitAt).trim();
  return text.trim();
}

export function safeReplyFromUnparsedAiText(text: string, phase: Phase): string {
  const isPlanPhase = phase === "planning" || phase === "reviewing" || phase === "clarifying";
  const looksLikeProtocol = /"reply"\s*:|\"plan\"\s*:|^\s*\{/.test(text);
  if (isPlanPhase && looksLikeProtocol) {
    return "模型返回了计划数据，但格式解析失败。请再点一次调整，或换一种更短的反馈。";
  }
  return extractReplyFromText(text);
}

export function parsePlanFromMarkdown(text: string, currentVersion: number): PlanState | null {
  const extract = (pattern: RegExp): string => {
    const m = text.match(pattern);
    return m?.[1]?.trim() ?? "";
  };

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

  const steps: string[] = [];
  const stepsSection = text.match(/步骤[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n###|$)/);
  if (stepsSection) {
    const stepLines = stepsSection[1].match(/^\d+\.\s+(.+)$/gm);
    if (stepLines) {
      for (const line of stepLines) steps.push(line.replace(/^\d+\.\s+/, "").trim());
    }
  }

  if (steps.length === 0) {
    const allSteps = text.match(/^\d+\.\s+(.+)$/gm);
    if (allSteps) {
      for (const line of allSteps.slice(-8)) steps.push(line.replace(/^\d+\.\s+/, "").trim());
    }
  }

  const risks: string[] = [];
  const riskSection = text.match(/风险[^\n]*\n+([\s\S]+?)(?=\n##|\n---|\n###|$)/);
  if (riskSection) {
    const riskLines = riskSection[1].match(/^[-*]\s+(.+)$/gm);
    if (riskLines) {
      for (const line of riskLines.slice(0, 5)) risks.push(line.replace(/^[-*]\s+/, "").trim());
    }
  }

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

function normalizeSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown): string => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const main = obj.step ?? obj.description ?? obj.title ?? obj.name ?? obj.content ?? "";
      const time = obj.time ?? obj.duration ?? "";
      const text = String(main);
      return time ? `${text}（${time}）` : text;
    }
    return String(item);
  }).filter(Boolean);
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
  }).filter(Boolean);
}

export function extractPlanFromParsed(parsed: Record<string, unknown>, currentVersion: number): PlanState | null {
  const raw = (parsed.plan && typeof parsed.plan === "object")
    ? parsed.plan as Record<string, unknown>
    : parsed;

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
  const actionSteps = normalizeSteps(getArray("actionSteps", "action_steps", "steps", "行动步骤", "步骤"));
  const riskWarnings = normalizeRisks(getArray("riskWarnings", "risk_warnings", "risks", "风险提示", "风险"));
  const nextOptions = normalizeSteps(getArray("nextOptions", "next_options", "options", "下一步"));

  if (!userProfile && !problemJudgment && actionSteps.length === 0) return null;

  return {
    userProfile: userProfile || "（参见对话记录）",
    problemJudgment: problemJudgment || "（参见对话记录）",
    systemLogic: systemLogic || "（参见上方分析）",
    recommendedPath: recommendedPath || "（参见步骤列表）",
    actionSteps: actionSteps.length > 0 ? actionSteps : ["根据上方分析执行"],
    riskWarnings: riskWarnings.length > 0 ? riskWarnings : ["请确认每个步骤的前提条件"],
    nextOptions: nextOptions.length > 0 ? nextOptions : ["更简单", "更专业", "拆开讲", "换方向"],
    version: currentVersion,
    isCurrent: true,
  };
}

function extensionForLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  const byLanguage: Record<string, string> = {
    python: "py",
    py: "py",
    javascript: "js",
    js: "js",
    typescript: "ts",
    ts: "ts",
    matlab: "m",
    octave: "m",
    cpp: "cpp",
    "c++": "cpp",
    c: "c",
    java: "java",
    rust: "rs",
    go: "go",
    bash: "sh",
    shell: "sh",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md",
    md: "md",
  };
  return byLanguage[normalized] ?? "txt";
}

function sanitizeCodeFilename(filename: string, language: string, version: number, index: number): string {
  const trimmed = filename.trim();
  const withoutInvalid = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/\.\.+/g, ".");
  const base = withoutInvalid || `code-${index + 1}.${extensionForLanguage(language)}`;
  const withExt = /\.[a-zA-Z0-9]+$/.test(base)
    ? base
    : `${base}.${extensionForLanguage(language)}`;
  return `code-v${version}-${withExt}`;
}

export function extractCodeFilesFromParsed(parsed: Record<string, unknown>, currentVersion: number): CodeFileArtifact[] {
  const root = (parsed.plan && typeof parsed.plan === "object")
    ? parsed.plan as Record<string, unknown>
    : parsed;
  const raw = Array.isArray(parsed.codeFiles)
    ? parsed.codeFiles
    : Array.isArray(root.codeFiles)
      ? root.codeFiles
      : Array.isArray(root.code_files)
        ? root.code_files
        : [];

  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const content = typeof obj.content === "string"
      ? obj.content
      : typeof obj.code === "string"
        ? obj.code
        : typeof obj.source === "string"
          ? obj.source
          : "";
    if (!content.trim()) return [];

    const language = typeof obj.language === "string"
      ? obj.language
      : typeof obj.lang === "string"
        ? obj.lang
        : "text";
    const rawFilename = typeof obj.filename === "string"
      ? obj.filename
      : typeof obj.name === "string"
        ? obj.name
        : `code-${index + 1}.${extensionForLanguage(language)}`;
    const storedFilename = sanitizeCodeFilename(rawFilename, language, currentVersion, index);
    const title = typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim()
      : `示例代码 v${currentVersion} · ${rawFilename}`;

    return [{
      filename: storedFilename,
      title,
      language,
      content,
      version: currentVersion,
    }];
  });
}

export function planToMarkdown(plan: PlanState): string {
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

export function buildSummaryDocument(plan: PlanState): string {
  return `# 当前科研探索摘要

## 当前版本
Plan v${plan.version}

## 一句话判断
${plan.problemJudgment}

## 适合你的路线
${plan.recommendedPath}

## 关键边界
${plan.systemLogic}

## 下一步
${plan.actionSteps[0] ?? "继续确认研究目标和交付物。"}
`;
}

export function buildChecklistDocument(plan: PlanState): string {
  return `# 行动检查清单

${plan.actionSteps.map((step, i) => `- [ ] ${i + 1}. ${step}`).join("\n")}

## 风险复核
${plan.riskWarnings.map((risk) => `- [ ] ${risk}`).join("\n")}
`;
}

export function buildResearchPathDocument(plan: PlanState): string {
  return `# 科研路径说明

## 起点
${plan.userProfile}

## 路径
${plan.recommendedPath}

## 为什么这样走
${plan.systemLogic}

## 分阶段执行
${plan.actionSteps.map((step, i) => `### 阶段 ${i + 1}\n${step}`).join("\n\n")}
`;
}

export function persistPlanArtifacts(
  sessionId: string,
  plan: PlanState,
  codeFiles: CodeFileArtifact[] = [],
): void {
  savePlan(sessionId, plan.version, planToMarkdown(plan), plan.modifiedReason);
  saveMarkdownDocument(sessionId, "summary.md", "当前科研探索摘要", "summary", buildSummaryDocument(plan), plan.version);
  saveMarkdownDocument(sessionId, "action-checklist.md", "行动检查清单", "checklist", buildChecklistDocument(plan), plan.version);
  saveMarkdownDocument(sessionId, "research-path.md", "科研路径说明", "path", buildResearchPathDocument(plan), plan.version);
  for (const file of codeFiles) {
    saveCodeFile(sessionId, file.filename, file.title, file.language, file.content, file.version);
  }
}

export function restoreLatestPlan(sessionId: string, manifest: FileManifest[]): PlanState | undefined {
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

export function buildConversationMessages(systemPrompt: string, history: ChatMessage[], maxTurns = 30): ChatMsg[] {
  const msgs: ChatMsg[] = [{ role: "system", content: systemPrompt }];
  for (const m of history.slice(-maxTurns)) {
    if (m.role === "user" || m.role === "assistant") {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}

export function buildFallbackTurn(
  phase: Phase,
  ready: boolean,
  hasPlan: boolean,
): { reply: string; questions: string[] } {
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

export function buildProcessSummary({
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
    `- 模式：${fallback ? "规则兜底" : "AI 生成"}`,
  ];

  if (fallback) {
    lines.push("- 处理：AI 调用失败，已切换为规则兜底选项");
  } else if (plan) {
    lines.push(`- 处理：生成或更新科研探索计划 v${plan.version}`);
    lines.push("- 产物：已同步更新 Plan、摘要、行动清单和科研路径文档");
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

export function getNextPhase({
  currentPhase,
  memory,
  planState,
  checklistPassed,
}: {
  currentPhase: Phase;
  memory: UserProfileMemory;
  planState?: PlanState | null;
  checklistPassed: boolean;
}): Phase {
  if (currentPhase === "greeting") return "profiling";
  if (currentPhase === "profiling" && isProfileReady(memory)) return "clarifying";
  if (currentPhase === "clarifying" && planState) return "reviewing";
  if (currentPhase === "clarifying" && checklistPassed) return "planning";
  if (currentPhase === "planning" && planState) return "reviewing";
  if (currentPhase === "reviewing") return "reviewing";
  return currentPhase;
}

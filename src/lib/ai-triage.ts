import { chat, DEFAULT_MODEL } from "./ai-provider";
import type {
  AiTriageResponse,
  AnswerRoute,
  GenerateAnswerResponse,
  IntakeRequest,
  NormalizedInput,
  ServiceRecommendation,
  TriageResult,
} from "./triage-types";

// ─── Shared system prompt ─────────────────────────────────────────

const SYSTEM_PREFIX = `你是「科研课题分诊台」的 AI 客服，面向中文学生用户。
核心职责：先判断用户是谁、卡在哪、能做什么，再给路径，最后推荐服务。
安全边界：不代写论文、不伪造数据、不帮助作弊。只做理解、规划、辅导和真实交付路径。
输出风格：弱术语、强解释、给可执行的具体步骤。`;

// ─── JSON extraction ──────────────────────────────────────────────

function parseJsonFromText(text: string): Record<string, unknown> {
  console.log("[ai-triage] raw (first 200):", text.slice(0, 200));

  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* */ }

  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]) as Record<string, unknown>; } catch { /* */ }
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    } catch { /* */ }
  }

  throw new Error(
    `JSON解析失败\n--- RAW (前500字) ---\n${text.slice(0, 500)}\n--- END ---`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

const S = (extra: string) => `${SYSTEM_PREFIX}\n\n${extra}`;

// ─── Exports ──────────────────────────────────────────────────────

export async function aiTriageAnalysis(intake: IntakeRequest): Promise<AiTriageResponse> {
  const text = await chat({
    temperature: 0.3,
    system: S(`根据用户输入生成一个 JSON。格式：
{
  "normalized": {
    "topic": "课题一句话描述",
    "taskType": "任务类型",
    "deadline": "截止时间",
    "userBackground": "用户基础水平",
    "painPoint": "当前卡点核心问题",
    "targetOutput": "用户期望目标产物",
    "missingFields": ["缺失信息"]
  },
  "triage": {
    "userType": "A",
    "secondaryType": null,
    "confidence": 0.85,
    "taskStage": "课题理解期",
    "difficulty": "中",
    "riskList": ["风险1","风险2","风险3"],
    "reason": "分类依据"
  },
  "route": {
    "answerMode": "plain_explain",
    "mustInclude": ["要点"],
    "mustAvoid": ["禁止项"]
  },
  "clarification": {
    "needClarification": false,
    "questions": [],
    "readyToGenerate": true
  }
}
约束：
- userType: "A"|"B"|"C"|"D"|"E" (完全小白型/基础薄弱型/普通项目型/科研能力型/焦虑决策型)
- confidence: 0.0-1.0
- taskStage: "课题理解期"|"路线规划期"|"交付准备期"
- difficulty: "低"|"中"|"中高"|"高"
- answerMode: "plain_explain"|"execution_focused"|"mvp_planning"|"research_review"|"anxiety_reduction"
- 信息严重不足时 needClarification=true
只输出JSON，不要解释文字。`),
    prompt: `任务类型：${intake.taskType}
卡在哪：${intake.currentBlocker}
基础：${intake.backgroundLevel}
截止：${intake.deadline}
目标：${intake.goalType}
课题：${intake.topicText}`,
  });

  return parseJsonFromText(text) as unknown as AiTriageResponse;
}

export async function aiGenerateAnswer(
  normalized: NormalizedInput,
  triage: TriageResult,
  route: AnswerRoute,
): Promise<GenerateAnswerResponse> {
  const input = JSON.stringify({ normalized, triage, route }, null, 2);

  const [a, q] = await Promise.all([
    chat({
      temperature: 0.5,
      system: S(`生成个性化回答。返回JSON：
{"answerText":"300-600字","nextSteps":["步骤1"],"riskNotes":["风险"],"downgradePlan":"兜底方案","teacherScript":"沟通话术"}
类型:${triage.userType} 模式:${route.answerMode}
必须包含:${route.mustInclude.join("、")} 必须避免:${route.mustAvoid.join("、")}
只输出JSON。`),
      prompt: input,
    }),
    chat({
      temperature: 0.1,
      system: S(`质量检查。返回JSON：
{"pass":true,"matchUserType":true,"hasNextStep":true,"hasRisk":true,"hasDowngradePlan":true,"tooComplex":false,"tooGeneric":false,"commercialRecommendationReasonable":true,"revisionInstruction":""}
只输出JSON。`),
      prompt: `检查${triage.userType}类型用户的回答质量。`,
    }),
  ]);

  return {
    answer: parseJsonFromText(a) as GenerateAnswerResponse["answer"],
    quality: parseJsonFromText(q) as GenerateAnswerResponse["quality"],
  };
}

export async function aiRecommendService(
  triage: TriageResult,
  normalized: NormalizedInput,
): Promise<ServiceRecommendation> {
  const text = await chat({
    temperature: 0.3,
    system: S(`服务推荐。返回JSON：
{"recommendedService":"课题理解包","reason":"推荐理由","notRecommended":"不推荐其他原因","cta":"行动号召"}
选项：课题理解包(小白) | 项目路线包(有交付目标) | 陪跑审查包(时间紧/焦虑/跑偏) | 免费继续问(有能力)
精准匹配，不硬推高价。只输出JSON。`),
    prompt: `类型:${triage.userType} 阶段:${triage.taskStage} 难度:${triage.difficulty}
风险:${triage.riskList.join("；")} 课题:${normalized.topic} 卡点:${normalized.painPoint}
目标:${normalized.targetOutput} 截止:${normalized.deadline}`,
  });
  return parseJsonFromText(text) as unknown as ServiceRecommendation;
}

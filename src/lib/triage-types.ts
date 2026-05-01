import { z } from "zod";

export const taskTypes = [
  "课程项目",
  "毕设",
  "大创",
  "竞赛",
  "导师课题",
  "论文阅读",
  "组会汇报",
  "个人科研探索",
] as const;

export const currentBlockers = [
  "看不懂题目",
  "不知道查什么",
  "不知道怎么做",
  "不知道能不能做出来",
  "不知道怎么写文档",
  "不知道怎么汇报",
  "老师要求不清楚",
  "已经做了但感觉跑偏",
] as const;

export const backgroundLevels = [
  "完全小白",
  "有一点基础",
  "能看懂基础材料",
  "能写代码做 Demo",
  "能独立读论文或做实验",
] as const;

export const deadlines = ["3 天内", "1 周内", "1 个月内", "更久"] as const;

export const goalTypes = [
  "先看懂课题",
  "确定能不能做",
  "做出 MVP",
  "完成交付材料",
  "准备汇报或答辩",
] as const;

export const userProfiles = [
  "完全小白型",
  "基础薄弱型",
  "普通项目型",
  "科研能力型",
  "焦虑决策型",
] as const;

export const taskCategories = [
  "课题理解",
  "文献入门",
  "技术路线",
  "项目Demo",
  "汇报答辩",
  "风险审查",
] as const;

export const currentStages = ["课题理解期", "路线规划期", "交付准备期"] as const;

export const difficultyLevels = ["低", "中", "中高", "高"] as const;

export const recommendedServices = [
  "免费继续问",
  "课题理解包",
  "项目路线包",
  "陪跑/审查包",
] as const;

export const intakeSchema = z.object({
  taskType: z.enum(taskTypes),
  currentBlocker: z.enum(currentBlockers),
  backgroundLevel: z.enum(backgroundLevels),
  deadline: z.enum(deadlines),
  goalType: z.enum(goalTypes),
  topicText: z
    .string()
    .trim()
    .min(30, "请至少输入 30 个字，方便系统判断真实课题状态。")
    .max(2000, "请输入 2000 字以内的课题描述。"),
});

export type TaskType = (typeof taskTypes)[number];
export type CurrentBlocker = (typeof currentBlockers)[number];
export type BackgroundLevel = (typeof backgroundLevels)[number];
export type Deadline = (typeof deadlines)[number];
export type GoalType = (typeof goalTypes)[number];
export type UserProfile = (typeof userProfiles)[number];
export type TaskCategory = (typeof taskCategories)[number];
export type CurrentStage = (typeof currentStages)[number];
export type DifficultyLevel = (typeof difficultyLevels)[number];
export type RecommendedService = (typeof recommendedServices)[number];

export type IntakeRequest = z.infer<typeof intakeSchema>;

export type TriageResponse = {
  userProfile: UserProfile;
  taskCategory: TaskCategory;
  currentStage: CurrentStage;
  difficulty: DifficultyLevel;
  riskList: string[];
  plainExplanation: string;
  minimumPath: string[];
  recommendedService: RecommendedService;
  serviceReason: string;
  safetyMode: boolean;
};

export type RoutePlanRequest = {
  intake: IntakeRequest;
  triage: TriageResponse;
};

export type RoutePlanResponse = {
  overview: string;
  deliverables: string[];
  routeSteps: { phase: string; tasks: string[] }[];
  fallbackPlan: string[];
  teacherTalkingPoints: string[];
};

export type TriageFieldErrors = Partial<Record<keyof IntakeRequest, string>>;

export const defaultIntakeValues: IntakeRequest = {
  taskType: "课程项目",
  currentBlocker: "看不懂题目",
  backgroundLevel: "完全小白",
  deadline: "1 周内",
  goalType: "先看懂课题",
  topicText: "",
};

// ─── P0 AI Pipeline Types ────────────────────────────────────────

/** Structured input normalized from raw intake + topic text */
export type NormalizedInput = {
  topic: string;
  taskType: string;
  deadline: string;
  userBackground: string;
  painPoint: string;
  targetOutput: string;
  missingFields: string[];
};

/** A-E user type for the AI pipeline */
export type UserTypeCode = "A" | "B" | "C" | "D" | "E";

export const userTypeMap: Record<UserTypeCode, UserProfile> = {
  A: "完全小白型",
  B: "基础薄弱型",
  C: "普通项目型",
  D: "科研能力型",
  E: "焦虑决策型",
};

export const userTypeReverseMap: Record<UserProfile, UserTypeCode> = {
  完全小白型: "A",
  基础薄弱型: "B",
  普通项目型: "C",
  科研能力型: "D",
  焦虑决策型: "E",
};

export type TriageResult = {
  userType: UserTypeCode;
  secondaryType?: UserTypeCode;
  confidence: number;
  taskStage: string;
  difficulty: "低" | "中" | "中高" | "高";
  riskList: string[];
  reason: string;
};

export type ClarificationDecision = {
  needClarification: boolean;
  questions: string[];
  readyToGenerate: boolean;
};

export type AnswerRoute = {
  answerMode:
    | "plain_explain"
    | "execution_focused"
    | "mvp_planning"
    | "research_review"
    | "anxiety_reduction";
  mustInclude: string[];
  mustAvoid: string[];
};

export type GeneratedAnswer = {
  answerText: string;
  nextSteps: string[];
  riskNotes: string[];
  downgradePlan: string;
  teacherScript: string;
};

export type QualityCheck = {
  pass: boolean;
  matchUserType: boolean;
  hasNextStep: boolean;
  hasRisk: boolean;
  hasDowngradePlan: boolean;
  tooComplex: boolean;
  tooGeneric: boolean;
  commercialRecommendationReasonable: boolean;
  revisionInstruction: string;
};

export type ServiceRecommendation = {
  recommendedService: string;
  reason: string;
  notRecommended: string;
  cta: string;
};

/** Combined response from the AI triage endpoint */
export type AiTriageResponse = {
  normalized: NormalizedInput;
  triage: TriageResult;
  clarification: ClarificationDecision;
  route: AnswerRoute;
};

/** Combined response from the generate-answer endpoint */
export type GenerateAnswerResponse = {
  answer: GeneratedAnswer;
  quality: QualityCheck;
};

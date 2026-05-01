import type {
  BackgroundLevel,
  CurrentBlocker,
  CurrentStage,
  DifficultyLevel,
  IntakeRequest,
  RecommendedService,
  TaskCategory,
  TriageResponse,
  UserProfile,
} from "./triage-types";

const safetyPatterns = [
  "代写",
  "替我写",
  "帮我完成论文",
  "替做",
  "伪造数据",
  "捏造数据",
  "假数据",
  "伪造实验",
  "捏造实验",
  "规避学术审查",
  "绕过查重",
  "包过答辩",
];

const anxietyWords = ["来不及", "怕", "焦虑", "完不成", "不敢", "老师会不会", "会不会挂"];

export function triageIntake(input: IntakeRequest): TriageResponse {
  const safetyMode = detectSafetyMode(input.topicText);
  const userProfile = classifyUserProfile(input);
  const taskCategory = classifyTaskCategory(input);
  const currentStage = classifyStage(taskCategory, input.currentBlocker);
  const difficulty = classifyDifficulty(input, userProfile, taskCategory);
  const riskList = buildRiskList(input, taskCategory, userProfile, safetyMode);
  const minimumPath = buildMinimumPath(input, taskCategory, safetyMode);
  const plainExplanation = buildPlainExplanation(
    input,
    userProfile,
    taskCategory,
    currentStage,
    safetyMode,
  );
  const recommendedService = recommendService(input, userProfile, safetyMode);
  const serviceReason = buildServiceReason(
    input,
    userProfile,
    recommendedService,
    safetyMode,
  );

  return {
    userProfile,
    taskCategory,
    currentStage,
    difficulty,
    riskList,
    plainExplanation,
    minimumPath,
    recommendedService,
    serviceReason,
    safetyMode,
  };
}

function detectSafetyMode(topicText: string): boolean {
  return safetyPatterns.some((pattern) => topicText.includes(pattern));
}

function classifyUserProfile(input: IntakeRequest): UserProfile {
  const anxious =
    input.currentBlocker === "不知道能不能做出来" ||
    (input.deadline !== "更久" && anxietyWords.some((word) => input.topicText.includes(word)));

  if (anxious) {
    return "焦虑决策型";
  }

  if (input.backgroundLevel === "能独立读论文或做实验") {
    return "科研能力型";
  }

  if (input.backgroundLevel === "完全小白") {
    return "完全小白型";
  }

  if (
    input.goalType === "做出 MVP" ||
    input.goalType === "完成交付材料" ||
    input.goalType === "准备汇报或答辩" ||
    ["课程项目", "毕设", "大创", "竞赛"].includes(input.taskType)
  ) {
    return "普通项目型";
  }

  return "基础薄弱型";
}

function classifyTaskCategory(input: IntakeRequest): TaskCategory {
  if (input.currentBlocker === "看不懂题目" || input.goalType === "先看懂课题") {
    return "课题理解";
  }

  if (input.currentBlocker === "不知道查什么") {
    return "文献入门";
  }

  if (
    input.currentBlocker === "不知道怎么汇报" ||
    input.currentBlocker === "不知道怎么写文档" ||
    input.goalType === "准备汇报或答辩" ||
    input.taskType === "组会汇报"
  ) {
    return "汇报答辩";
  }

  if (
    input.currentBlocker === "已经做了但感觉跑偏" ||
    input.currentBlocker === "不知道能不能做出来"
  ) {
    return "风险审查";
  }

  if (input.goalType === "做出 MVP" || input.goalType === "完成交付材料") {
    return "项目Demo";
  }

  return "技术路线";
}

function classifyStage(
  taskCategory: TaskCategory,
  currentBlocker: CurrentBlocker,
): CurrentStage {
  if (taskCategory === "课题理解" || taskCategory === "文献入门") {
    return "课题理解期";
  }

  if (
    taskCategory === "汇报答辩" ||
    currentBlocker === "不知道怎么汇报" ||
    currentBlocker === "不知道怎么写文档"
  ) {
    return "交付准备期";
  }

  return "路线规划期";
}

function classifyDifficulty(
  input: IntakeRequest,
  userProfile: UserProfile,
  taskCategory: TaskCategory,
): DifficultyLevel {
  let score = 0;

  const taskWeight: Record<string, number> = {
    课程项目: 1,
    毕设: 2,
    大创: 2,
    竞赛: 2,
    导师课题: 3,
    论文阅读: 1,
    组会汇报: 1,
    个人科研探索: 2,
  };

  const backgroundWeight: Record<BackgroundLevel, number> = {
    完全小白: 2,
    有一点基础: 1,
    能看懂基础材料: 1,
    "能写代码做 Demo": 0,
    能独立读论文或做实验: -1,
  };

  score += taskWeight[input.taskType] ?? 1;
  score += backgroundWeight[input.backgroundLevel];

  if (input.deadline === "3 天内") {
    score += 2;
  } else if (input.deadline === "1 周内") {
    score += 1;
  }

  if (taskCategory === "风险审查" || taskCategory === "项目Demo") {
    score += 1;
  }

  if (userProfile === "焦虑决策型") {
    score += 1;
  }

  if (score <= 1) {
    return "低";
  }

  if (score <= 3) {
    return "中";
  }

  if (score <= 5) {
    return "中高";
  }

  return "高";
}

function buildRiskList(
  input: IntakeRequest,
  taskCategory: TaskCategory,
  userProfile: UserProfile,
  safetyMode: boolean,
): string[] {
  const risks: string[] = [];

  const pushRisk = (risk: string) => {
    if (!risks.includes(risk)) {
      risks.push(risk);
    }
  };

  if (safetyMode) {
    pushRisk("输入里包含学术诚信风险，必须改成真实可验证的交付路径。");
  }

  if (input.currentBlocker === "看不懂题目" || taskCategory === "课题理解") {
    pushRisk("研究对象、输入数据和输出结果还没有被说清楚，后续所有判断都会漂移。");
  }

  if (input.currentBlocker === "不知道查什么" || taskCategory === "文献入门") {
    pushRisk("关键词没有先收敛，容易一上来就被资料量淹没。");
  }

  if (input.goalType === "做出 MVP" || taskCategory === "项目Demo") {
    pushRisk("一开始就追求完整科研或复杂模型，Demo 很容易做不出来。");
  }

  if (input.taskType === "导师课题" || input.taskType === "毕设") {
    pushRisk("老师预期和你当前可交付物如果没对齐，返工成本会很高。");
  }

  if (input.deadline === "3 天内" || input.deadline === "1 周内") {
    pushRisk("截止时间偏紧，需要优先压缩目标，不然来不及形成可展示成果。");
  }

  if (userProfile === "焦虑决策型") {
    pushRisk("现在最大的阻碍不是资料不够，而是没有一个可执行的兜底方案。");
  }

  if (input.currentBlocker === "已经做了但感觉跑偏") {
    pushRisk("现有方案可能已经偏离交付目标，继续堆功能只会增加沉没成本。");
  }

  if (
    input.currentBlocker === "不知道怎么汇报" ||
    input.currentBlocker === "不知道怎么写文档" ||
    input.goalType === "准备汇报或答辩"
  ) {
    pushRisk("如果没有提前整理成果口径，最后阶段会出现能做出来但讲不清楚的问题。");
  }

  if (input.backgroundLevel === "完全小白" || input.backgroundLevel === "有一点基础") {
    pushRisk("当前技术路线如果直接上复杂方法，会明显超出你的上手速度。");
  }

  if (risks.length < 3) {
    pushRisk("如果没有先定义最低可交付成果，项目范围会不断膨胀。");
  }

  return risks.slice(0, 3);
}

function buildMinimumPath(
  input: IntakeRequest,
  taskCategory: TaskCategory,
  safetyMode: boolean,
): string[] {
  if (safetyMode) {
    return [
      "今天先把你真正要提交的成果列成 3 项：文档、演示、真实实验或数据证据，删掉任何代写或伪造预期。",
      "把老师或比赛要求改写成一句可验证的话：我需要证明什么，而不是伪造什么。",
      "只保留真实可完成的最小版本，例如公开数据验证、系统原型或方法复现说明。",
      "准备一段和老师沟通的说明，明确你走的是合规辅导与真实交付路线。",
    ];
  }

  if (taskCategory === "课题理解") {
    return [
      "今天先用一句话写清楚这件事研究什么、输入是什么、最后要产出什么。",
      "把课题描述拆成 3 个关键词，分别对应研究对象、方法方向和交付物。",
      "用这 3 个关键词各找 1 条最基础的解释材料，只看摘要或导论，不展开深读。",
      "把老师或题目里最含糊的一句要求抄出来，准备下次沟通时重点确认。",
    ];
  }

  if (taskCategory === "文献入门") {
    return [
      "今天先确定 3 个检索关键词：研究对象、输入数据、输出结果，禁止直接泛搜整个题目。",
      "每个关键词只找 1 篇综述或教程级材料，先判断你能否看懂摘要。",
      "记录 3 个反复出现的术语，并写下它们各自代表的问题。",
      "根据读到的内容回头收缩题目范围，删掉你现在做不到的部分。",
    ];
  }

  if (taskCategory === "汇报答辩") {
    return [
      "今天先列出老师或评委最可能追问的 3 个问题：你做了什么、为什么这样做、结果说明了什么。",
      "把现有内容压缩成一页结构：背景、方法、结果、局限。",
      "补齐最缺的证据位，比如流程图、实验表格或 Demo 截图。",
      "用 2 分钟口头复述一遍，找出你现在解释不顺的地方。",
    ];
  }

  if (taskCategory === "风险审查") {
    return [
      "今天先把当前方案写成 5 行：目标、输入、方法、输出、截止时间，暴露真正卡住的环节。",
      "为每个环节打上可做 / 存疑 / 做不了，优先删掉存疑最多的一段。",
      "把目标降成一个最小可交付版本，例如可演示原型、复现结果或答辩材料。",
      "整理一段兜底说法，确保即使降级路线也能向老师解释得过去。",
    ];
  }

  if (taskCategory === "项目Demo") {
    return [
      "今天先画出最小流程：输入什么、系统怎么处理、最后展示什么结果。",
      "确认 Demo 只保留一个核心场景，不同时追求训练、部署和完整科研创新。",
      "把所需数据、工具和页面拆成最少模块，先保证能跑通一条主链路。",
      "最后再补文档和展示材料，不要一开始就把时间花在扩展功能上。",
    ];
  }

  return [
    "今天先确定最低交付物到底是解释文档、系统原型还是汇报材料。",
    "把题目拆成研究对象、方法路线和结果展示三块，避免一步跳到模型。",
    "优先选择与你当前基础匹配的方法，先做能解释清楚的版本。",
    "用一段话写下本周目标，确保每一步都直接服务于交付。",
  ];
}

function buildPlainExplanation(
  input: IntakeRequest,
  userProfile: UserProfile,
  taskCategory: TaskCategory,
  currentStage: CurrentStage,
  safetyMode: boolean,
): string {
  if (safetyMode) {
    return "你现在最需要的不是更快生成内容，而是把任务改成真实、可验证、能向老师解释的交付路径。系统会切换成合规辅导模式，只帮助你理解课题、压缩目标和组织真实证据。";
  }

  const profileLead: Record<UserProfile, string> = {
    完全小白型: "你现在卡住很正常，问题不在于你不够努力，而在于课题还没有被翻译成人话。",
    基础薄弱型: "你已经有一些基础，但当前缺的是顺序和抓手，不是更多零散资料。",
    普通项目型: "你面对的是一个典型的学生项目问题，关键不是追求科研完整度，而是先做出像样的最小成果。",
    科研能力型: "你已经具备继续推进的基础，当前更需要的是压缩风险和确认技术路线边界。",
    焦虑决策型: "你现在最难的部分不是继续搜信息，而是尽快得到一个不会失控的判断和兜底方案。",
  };

  const categoryLead: Record<TaskCategory, string> = {
    课题理解: "当前阶段应该先搞清楚研究对象、输入和输出，再决定后面的方法。",
    文献入门: "你需要先收紧关键词和问题范围，否则资料只会越看越乱。",
    技术路线: "现在更适合先定交付路径，再反推方法，不建议直接跳到复杂模型。",
    项目Demo: "这类任务最稳的打法是先做可演示主链路，再补细节和扩展能力。",
    汇报答辩: "现阶段重点是把已有工作讲清楚，而不是再开启一条新战线。",
    风险审查: "你需要先判断现有方案哪里超出时间或能力，再决定保留什么、砍掉什么。",
  };

  return `${profileLead[userProfile]} 你目前处在${currentStage}，更接近“${taskCategory}”问题。${categoryLead[taskCategory]}`;
}

function recommendService(
  input: IntakeRequest,
  userProfile: UserProfile,
  safetyMode: boolean,
): RecommendedService {
  if (safetyMode) {
    return "免费继续问";
  }

  if (
    userProfile === "焦虑决策型" &&
    (input.deadline === "3 天内" || input.goalType === "完成交付材料")
  ) {
    return "陪跑/审查包";
  }

  if (userProfile === "科研能力型" && input.currentBlocker === "已经做了但感觉跑偏") {
    return "陪跑/审查包";
  }

  if (
    userProfile === "普通项目型" ||
    input.goalType === "做出 MVP" ||
    input.goalType === "完成交付材料" ||
    input.currentBlocker === "不知道怎么做"
  ) {
    return "项目路线包";
  }

  if (
    input.goalType === "先看懂课题" ||
    input.currentBlocker === "看不懂题目" ||
    userProfile === "完全小白型"
  ) {
    return "课题理解包";
  }

  if (
    input.currentBlocker === "不知道查什么" &&
    input.backgroundLevel === "能独立读论文或做实验"
  ) {
    return "免费继续问";
  }

  return "课题理解包";
}

function buildServiceReason(
  input: IntakeRequest,
  userProfile: UserProfile,
  recommendedService: RecommendedService,
  safetyMode: boolean,
): string {
  if (safetyMode) {
    return "这次不适合直接推高价服务。你当前更需要先把任务拉回合规轨道，继续免费问可以先把真实交付边界、老师预期和可验证材料整理清楚。";
  }

  if (recommendedService === "课题理解包") {
    return `你现在更缺的是“先看懂再开做”，不是立刻进入复杂路线。以${userProfile}来看，先把题目翻译成人话、补齐关键词和提问清单，能最快降低误判和焦虑。`;
  }

  if (recommendedService === "项目路线包") {
    return `你当前的重心已经不是单纯理解，而是把${input.taskType}落成可执行路径。项目路线包更适合解决 MVP、阶段计划、资料顺序和交付物定义，不会把你继续困在信息堆里。`;
  }

  if (recommendedService === "陪跑/审查包") {
    return "你现在的主要问题是时间、风险或方向偏差已经开始放大，单次解释不够。陪跑/审查包更适合做路线纠偏、兜底方案和关键节点复核，减少最后阶段的大返工。";
  }

  return "你当前还有空间先通过免费追问把问题收敛，再决定是否进入更完整的服务路径。";
}

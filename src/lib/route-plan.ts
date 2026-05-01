import type {
  IntakeRequest,
  RoutePlanResponse,
  TaskCategory,
  TriageResponse,
  UserProfile,
} from "./triage-types";

export function buildRoutePlan(
  intake: IntakeRequest,
  triage: TriageResponse,
): RoutePlanResponse {
  const overview = buildOverview(intake, triage);
  const deliverables = buildDeliverables(intake, triage);
  const routeSteps = buildRouteSteps(intake, triage);
  const fallbackPlan = buildFallbackPlan(intake, triage);
  const teacherTalkingPoints = buildTeacherTalkingPoints(intake, triage);

  return { overview, deliverables, routeSteps, fallbackPlan, teacherTalkingPoints };
}

function buildOverview(intake: IntakeRequest, triage: TriageResponse): string {
  if (triage.safetyMode) {
    return "当前路线以合规交付为核心目标。所有步骤都围绕真实可验证的成果展开，不包含任何代写或伪造路径。";
  }

  const profileNote: Record<UserProfile, string> = {
    完全小白型: "你现在最需要的不是更多资料，而是先把课题翻译成人话，再找到最小可做的版本。",
    基础薄弱型: "你已经有一定基础，但缺少顺序和抓手。这份路线会帮你把任务拆成可执行的阶段。",
    普通项目型: "这份路线以可交付成果为核心，优先帮你做出能展示的 MVP，而不是追求完整科研深度。",
    科研能力型: "你具备推进能力，这份路线重点在于压缩风险、确认技术边界和提高可发表性判断。",
    焦虑决策型: "你现在最需要的是一个不会失控的兜底方案。这份路线会先给你最低可行版本，再逐步扩展。",
  };

  return `${profileNote[triage.userProfile]} 任务类型：${intake.taskType}，当前阶段：${triage.currentStage}，主要问题归类为"${triage.taskCategory}"。`;
}

function buildDeliverables(intake: IntakeRequest, triage: TriageResponse): string[] {
  const category = triage.taskCategory;

  const base: Record<TaskCategory, string[]> = {
    课题理解: [
      "一句话课题说明：研究对象、输入数据、输出结果",
      "3 个核心关键词及其含义",
      "最低可交付成果定义",
      "向老师确认的问题清单",
    ],
    文献入门: [
      "3 个检索关键词及对应问题",
      "5 篇可读懂摘要的参考文献",
      "领域核心术语表（5-8 个）",
      "收窄后的课题范围说明",
    ],
    技术路线: [
      "技术路线选型说明（含理由）",
      "数据来源与处理方案",
      "模型或方法选择依据",
      "阶段里程碑列表",
    ],
    项目Demo: [
      "可运行的最小 Demo（单条主链路）",
      "输入输出示例截图或记录",
      "系统流程图或架构说明",
      "功能说明文档（1-2 页）",
    ],
    汇报答辩: [
      "汇报结构大纲（背景/方法/结果/局限）",
      "核心结论 3 条",
      "评委可能追问的 3 个问题及回答",
      "演示材料或 PPT 草稿",
    ],
    风险审查: [
      "当前方案风险清单（可做/存疑/做不了）",
      "降级后的最小可交付版本定义",
      "兜底方案说明",
      "向老师解释的话术",
    ],
  };

  const items = [...base[category]];

  if (intake.taskType === "毕设" || intake.taskType === "大创") {
    items.push("项目报告结构草稿");
  }

  if (intake.deadline === "3 天内" || intake.deadline === "1 周内") {
    items.push("紧急版本：只保留核心可展示部分");
  }

  return items;
}

function buildRouteSteps(
  intake: IntakeRequest,
  triage: TriageResponse,
): { phase: string; tasks: string[] }[] {
  const isTight = intake.deadline === "3 天内" || intake.deadline === "1 周内";
  const category = triage.taskCategory;

  if (triage.safetyMode) {
    return [
      {
        phase: "今天",
        tasks: [
          "把真正要提交的成果列成 3 项，删掉任何代写或伪造预期",
          "把老师要求改写成一句可验证的话：我需要证明什么",
        ],
      },
      {
        phase: "接下来",
        tasks: [
          "只保留真实可完成的最小版本（公开数据验证、系统原型或方法复现）",
          "准备和老师沟通的说明，明确走合规辅导与真实交付路线",
        ],
      },
    ];
  }

  if (isTight) {
    return buildTightDeadlineSteps(category);
  }

  return buildNormalSteps(intake, category);
}

function buildTightDeadlineSteps(
  category: TaskCategory,
): { phase: string; tasks: string[] }[] {
  return [
    {
      phase: "今天",
      tasks: [
        "用一句话写清楚：研究什么、输入是什么、最后展示什么",
        "把目标压缩到最小可演示版本，删掉所有扩展功能",
      ],
    },
    {
      phase: "明天",
      tasks: [
        category === "项目Demo"
          ? "跑通一条最小主链路，哪怕数据是模拟的"
          : "整理现有材料，补齐最缺的一块证据",
        "准备一段 2 分钟口头说明",
      ],
    },
    {
      phase: "交付前",
      tasks: [
        "整理展示材料：流程图、截图或结果表格",
        "准备兜底说法：如果被追问做不完的部分怎么解释",
      ],
    },
  ];
}

function buildNormalSteps(
  intake: IntakeRequest,
  category: TaskCategory,
): { phase: string; tasks: string[] }[] {
  const steps: { phase: string; tasks: string[] }[] = [
    {
      phase: "今天",
      tasks: getCategoryFirstDayTasks(category),
    },
    {
      phase: "3 天内",
      tasks: getCategoryThreeDayTasks(category),
    },
    {
      phase: "1 周内",
      tasks: getCategoryOneWeekTasks(category),
    },
    {
      phase: "交付前",
      tasks: [
        "整理完整交付材料：文档、演示、说明",
        "用 2 分钟口头复述一遍，找出解释不顺的地方",
        intake.taskType === "毕设" || intake.taskType === "大创"
          ? "完成项目报告初稿，重点写清楚方法选择理由"
          : "准备汇报口径，确保能向老师解释每一步的决策",
      ],
    },
  ];

  return steps;
}

function getCategoryFirstDayTasks(category: TaskCategory): string[] {
  const map: Record<TaskCategory, string[]> = {
    课题理解: [
      "用一句话写清楚：研究对象、输入数据、输出结果",
      "把课题里最含糊的一句话抄出来，准备下次沟通时确认",
    ],
    文献入门: [
      "确定 3 个检索关键词，禁止直接泛搜整个题目",
      "每个关键词找 1 篇综述，只看摘要判断能否读懂",
    ],
    技术路线: [
      "列出 2-3 个候选方法，写下各自的优缺点",
      "确认数据来源：公开数据集还是需要自己收集",
    ],
    项目Demo: [
      "画出最小流程：输入什么 → 系统怎么处理 → 展示什么结果",
      "确认 Demo 只保留一个核心场景",
    ],
    汇报答辩: [
      "列出评委最可能追问的 3 个问题",
      "把现有内容压缩成一页结构：背景/方法/结果/局限",
    ],
    风险审查: [
      "把当前方案写成 5 行：目标/输入/方法/输出/截止时间",
      "为每个环节打标签：可做 / 存疑 / 做不了",
    ],
  };
  return map[category];
}

function getCategoryThreeDayTasks(category: TaskCategory): string[] {
  const map: Record<TaskCategory, string[]> = {
    课题理解: [
      "把 3 个关键词各找 1 条基础解释材料，只看摘要",
      "写出课题的最低可交付成果定义",
    ],
    文献入门: [
      "记录 3 个反复出现的术语及其含义",
      "根据读到的内容收缩题目范围，删掉做不到的部分",
    ],
    技术路线: [
      "选定技术路线，写下选择理由",
      "确认第一个可运行的最小实验设计",
    ],
    项目Demo: [
      "搭建最小可运行框架，先跑通数据输入和输出",
      "不追求完整功能，只保证主链路能跑",
    ],
    汇报答辩: [
      "补齐最缺的证据位：流程图、实验表格或 Demo 截图",
      "写出核心结论 3 条，每条不超过 2 句",
    ],
    风险审查: [
      "删掉存疑最多的一段，把目标降成最小可交付版本",
      "整理兜底方案：如果 A 做不了，B 是什么",
    ],
  };
  return map[category];
}

function getCategoryOneWeekTasks(category: TaskCategory): string[] {
  const map: Record<TaskCategory, string[]> = {
    课题理解: [
      "完成课题背景说明初稿（500 字以内）",
      "确认技术路线方向，准备进入执行阶段",
    ],
    文献入门: [
      "整理文献笔记：每篇 3 句话总结",
      "确定课题的核心方法方向",
    ],
    技术路线: [
      "完成第一版实验或 Demo 原型",
      "记录实验结果，哪怕是负面结果",
    ],
    项目Demo: [
      "完成可演示的 Demo，能跑通完整主链路",
      "补充基本说明文档",
    ],
    汇报答辩: [
      "完成汇报材料初稿",
      "找一个人试讲一遍，收集反馈",
    ],
    风险审查: [
      "完成降级后的最小版本",
      "整理向老师解释的话术",
    ],
  };
  return map[category];
}

function buildFallbackPlan(intake: IntakeRequest, triage: TriageResponse): string[] {
  const plans: string[] = [];

  if (triage.taskCategory === "项目Demo" || intake.goalType === "做出 MVP") {
    plans.push("如果真实数据拿不到：改用公开数据集（如 UCI、Kaggle、HuggingFace）验证方法可行性。");
    plans.push("如果模型训练做不动：改成模型调用（API 或预训练模型）+ 结果分析系统。");
  }

  if (intake.taskType === "导师课题" || intake.taskType === "毕设") {
    plans.push("如果老师要求太高：主动沟通，把目标改成「工程演示型 MVP + 实验说明」，保留科研背景但降低实验深度。");
  }

  if (intake.deadline === "3 天内" || intake.deadline === "1 周内") {
    plans.push("如果时间不够：优先保证一个可演示的核心场景，其余功能标注为「后续扩展」。");
  }

  if (triage.userProfile === "焦虑决策型") {
    plans.push("如果整体方向跑偏：停下来先做一个 5 行方案说明（目标/输入/方法/输出/截止），再决定保留什么。");
  }

  if (plans.length < 2) {
    plans.push("如果进度落后：把交付物降级为「方法说明 + 流程图 + 局部实验结果」，不追求完整系统.");
    plans.push("如果技术路线卡住：换一个更简单的基线方法先跑通，再考虑优化。");
  }

  return plans;
}

function buildTeacherTalkingPoints(intake: IntakeRequest, triage: TriageResponse): string[] {
  const points: string[] = [];

  if (triage.currentStage === "课题理解期") {
    points.push(`"我目前在梳理课题的核心问题，计划先确认研究对象和最低交付物，再进入技术路线选择。"`);
    points.push(`"我想先和您确认一下：这个项目最重要的交付物是什么？是系统原型、实验结果还是分析报告？"`);
  }

  if (triage.currentStage === "路线规划期") {
    points.push(`"我已经确定了技术路线方向，计划先做一个最小可演示版本，再根据反馈决定是否扩展。"`);
    points.push(`"考虑到时间限制，我打算先完成核心功能，把扩展部分标注为后续迭代，这样更符合项目周期。"`);
  }

  if (triage.currentStage === "交付准备期") {
    points.push(`"当前阶段我在整理成果材料，核心结论是 [X]，主要局限是 [Y]，后续可以在 [Z] 方向继续深入。"`);
    points.push(`"这个版本是工程演示型 MVP，保留了科研背景，实验深度根据时间做了合理压缩。"`);
  }

  if (intake.taskType === "毕设" || intake.taskType === "大创") {
    points.push(`"我的方案是先做可验证的最小版本，确保核心逻辑正确，再补充完整实验和文档。"`);
  }

  return points;
}

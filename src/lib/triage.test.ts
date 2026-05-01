import { describe, expect, it } from "vitest";

import { triageIntake } from "./triage";
import type { IntakeRequest } from "./triage-types";

const baseInput: IntakeRequest = {
  taskType: "课程项目",
  currentBlocker: "不知道怎么做",
  backgroundLevel: "完全小白",
  deadline: "1 周内",
  goalType: "做出 MVP",
  topicText: "老师让我做一个 AI for Science 课程项目，但我现在只知道大概方向，不清楚要用什么数据，也不知道最低交付物应该长什么样。",
};

describe("triageIntake", () => {
  it("changes profile and recommendation when background changes", () => {
    const noviceResult = triageIntake(baseInput);
    const advancedResult = triageIntake({
      ...baseInput,
      backgroundLevel: "能独立读论文或做实验",
      currentBlocker: "已经做了但感觉跑偏",
      topicText: "我已经实现了一版原型，但方法路线越来越散，担心最后没有办法向老师解释清楚为什么这样做。",
    });

    expect(noviceResult.userProfile).toBe("完全小白型");
    expect(noviceResult.recommendedService).toBe("项目路线包");
    expect(advancedResult.userProfile).toBe("焦虑决策型");
    expect(advancedResult.recommendedService).toBe("陪跑/审查包");
  });

  it("keeps the first action concrete and executable", () => {
    const result = triageIntake(baseInput);
    expect(result.minimumPath[0]).toContain("今天先");
    expect(result.minimumPath[0]).not.toContain("多查资料");
  });

  it("switches to safety mode for integrity violations", () => {
    const result = triageIntake({
      ...baseInput,
      topicText: "帮我代写一篇课题论文，最好顺便伪造实验数据和结果，这样我可以直接交差。",
    });

    expect(result.safetyMode).toBe(true);
    expect(result.recommendedService).toBe("免费继续问");
    expect(result.riskList.some((risk) => risk.includes("学术诚信风险"))).toBe(true);
  });

  it("routes anxious delivery users to a higher-touch recommendation", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "不知道能不能做出来",
      goalType: "完成交付材料",
      deadline: "3 天内",
      topicText: "离答辩只剩 3 天，我怕做不完，也不确定现在这条路线老师会不会认可。",
    });

    expect(result.userProfile).toBe("焦虑决策型");
    expect(result.currentStage).toBe("路线规划期");
    expect(result.recommendedService).toBe("陪跑/审查包");
  });

  // 新增：完全小白型 → 课题理解包
  it("routes complete novice to topic understanding package", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "看不懂题目",
      goalType: "先看懂课题",
      backgroundLevel: "完全小白",
      topicText: "老师给了我一个关于图神经网络的课题，我完全不知道这是什么，也不知道从哪里开始学习。",
    });

    expect(result.userProfile).toBe("完全小白型");
    expect(result.taskCategory).toBe("课题理解");
    expect(result.recommendedService).toBe("课题理解包");
  });

  // 新增：基础薄弱型 → 项目路线包
  it("routes weak-background user to route package", () => {
    const result = triageIntake({
      ...baseInput,
      backgroundLevel: "有一点基础",
      currentBlocker: "不知道怎么做",
      goalType: "做出 MVP",
      taskType: "大创",
      topicText: "我参加了大创项目，方向是用机器学习预测材料性质，有一点 Python 基础，但不知道具体怎么推进。",
    });

    expect(result.userProfile).toBe("普通项目型");
    expect(result.recommendedService).toBe("项目路线包");
  });

  // 新增：科研能力型 + 文献入门 → 免费继续问
  it("routes capable researcher with literature blocker to free tier", () => {
    const result = triageIntake({
      ...baseInput,
      backgroundLevel: "能独立读论文或做实验",
      currentBlocker: "不知道查什么",
      goalType: "做出 MVP",
      taskType: "导师课题",
      topicText: "导师给了我一个新方向，关于扩散模型在蛋白质结构预测中的应用，我能读论文但不知道从哪篇开始检索。",
    });

    expect(result.userProfile).toBe("科研能力型");
    expect(result.taskCategory).toBe("文献入门");
    expect(result.recommendedService).toBe("免费继续问");
  });

  // 新增：汇报答辩场景
  it("classifies presentation blocker as 汇报答辩 category", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "不知道怎么汇报",
      goalType: "准备汇报或答辩",
      backgroundLevel: "能写代码做 Demo",
      topicText: "项目已经做完了，但下周要答辩，我不知道怎么把技术内容讲清楚，也不知道评委会问什么。",
    });

    expect(result.taskCategory).toBe("汇报答辩");
    expect(result.currentStage).toBe("交付准备期");
  });

  // 新增：老师要求不清楚 → 课题理解
  it("maps unclear teacher requirement to topic understanding", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "老师要求不清楚",
      goalType: "先看懂课题",
      topicText: "老师说让我做一个 AI 相关的项目，但没有给具体要求，我不知道他期望什么样的成果。",
    });

    expect(result.taskCategory).toBe("课题理解");
  });

  // 新增：风险审查场景 → 跑偏
  it("classifies off-track project as 风险审查", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "已经做了但感觉跑偏",
      backgroundLevel: "能写代码做 Demo",
      topicText: "我已经做了两周，但越做越觉得方向不对，功能越加越多，不知道最后能不能交出一个完整的东西。",
    });

    expect(result.taskCategory).toBe("风险审查");
    expect(result.userProfile).toBe("焦虑决策型");
  });

  // 新增：minimumPath 长度始终为 4
  it("always returns exactly 4 minimum path steps", () => {
    const profiles: IntakeRequest[] = [
      { ...baseInput, currentBlocker: "看不懂题目", goalType: "先看懂课题" },
      { ...baseInput, currentBlocker: "不知道查什么" },
      { ...baseInput, currentBlocker: "不知道怎么汇报", goalType: "准备汇报或答辩" },
      { ...baseInput, currentBlocker: "已经做了但感觉跑偏" },
      { ...baseInput, goalType: "做出 MVP" },
    ];

    for (const input of profiles) {
      const result = triageIntake(input);
      expect(result.minimumPath).toHaveLength(4);
    }
  });

  // 新增：riskList 最多 3 条
  it("returns at most 3 risks", () => {
    const result = triageIntake({
      ...baseInput,
      currentBlocker: "不知道能不能做出来",
      deadline: "3 天内",
      taskType: "导师课题",
      backgroundLevel: "完全小白",
      topicText: "导师要求我三天内完成一个完整的深度学习实验，我完全不知道怎么做，也没有数据。",
    });

    expect(result.riskList.length).toBeGreaterThanOrEqual(1);
    expect(result.riskList.length).toBeLessThanOrEqual(3);
  });

  // 新增：竞赛 + 截止紧 → 难度中高或高
  it("rates difficulty high for competition with tight deadline", () => {
    const result = triageIntake({
      ...baseInput,
      taskType: "竞赛",
      deadline: "3 天内",
      backgroundLevel: "完全小白",
      topicText: "参加了一个 AI 竞赛，三天后截止，我完全没有经验，不知道从哪里开始。",
    });

    expect(["中高", "高"]).toContain(result.difficulty);
  });
});

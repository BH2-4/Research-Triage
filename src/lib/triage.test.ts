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
    expect(advancedResult.userProfile).toBe("科研能力型");
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
});

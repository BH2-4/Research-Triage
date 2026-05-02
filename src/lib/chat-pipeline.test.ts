import { describe, expect, it } from "vitest";

import {
  extractCodeFilesFromParsed,
  extractPlanFromParsed,
  normalizeQuestions,
  parseJsonFromText,
  persistPlanArtifacts,
  safeReplyFromUnparsedAiText,
} from "./chat-pipeline";
import { getManifest, readFile } from "./userspace";
import type { PlanState } from "./triage-types";

describe("chat pipeline contracts", () => {
  it("extracts JSON from fenced or wrapped model output", () => {
    expect(parseJsonFromText('```json\n{"reply":"ok"}\n```')).toEqual({ reply: "ok" });
    expect(parseJsonFromText('前置说明 {"reply":"ok","questions":[]} 后置说明')).toEqual({
      reply: "ok",
      questions: [],
    });
  });

  it("extracts protocol JSON after a leaked process preface", () => {
    const parsed = parseJsonFromText(`阶段：Plan 调整 -> Plan 调整
画像：已识别 7/10 个字段，可靠字段 7/10 个
处理：根据当前阶段生成下一步结构化选项

{"reply":"已按反馈更新","plan":{"userProfile":"用户画像","problemJudgment":"问题判断","systemLogic":"系统逻辑","recommendedPath":"推荐路径","actionSteps":["步骤1"],"riskWarnings":["风险1"],"nextOptions":["更简单"]}}`);

    expect(parsed).toMatchObject({
      reply: "已按反馈更新",
      plan: expect.objectContaining({
        actionSteps: ["步骤1"],
      }),
    });
  });

  it("does not expose protocol JSON as a plan-phase chat reply", () => {
    const reply = safeReplyFromUnparsedAiText('{"reply":"ok","plan":{"actionSteps":[]}}', "reviewing");

    expect(reply).not.toContain("{");
    expect(reply).toContain("格式解析失败");
  });

  it("splits one question containing A/B/C sub-options into clickable facts", () => {
    const normalized = normalizeQuestions([
      "你对MATLAB/Simulink的熟悉程度是：A.熟练使用；B.基本了解但需要参考教程；C.从未用过，愿意从零学",
    ]);

    expect(normalized).toEqual([
      "你对MATLAB/Simulink的熟悉程度是：熟练使用；",
      "你对MATLAB/Simulink的熟悉程度是：基本了解但需要参考教程；",
      "你对MATLAB/Simulink的熟悉程度是：从未用过，愿意从零学",
    ]);
  });

  it("removes a stem-only question when concrete options exist", () => {
    const normalized = normalizeQuestions([
      "接下来你想要明确的问题？",
      "接下来你想要明确的问题：你对matlab/simulink的熟悉程度？",
      "接下来你想要明确的问题：你希望先看懂模型还是先跑通最小demo？",
    ]);

    expect(normalized).toEqual([
      "接下来你想要明确的问题：你对matlab/simulink的熟悉程度？",
      "接下来你想要明确的问题：你希望先看懂模型还是先跑通最小demo？",
    ]);
  });

  it("normalizes plan fields and object-form steps", () => {
    const plan = extractPlanFromParsed({
      plan: {
        user_profile: "小白用户",
        problem_judgment: "问题已收敛",
        system_logic: "按最小可验证路径推进",
        recommended_path: "先做一周 demo",
        steps: [
          { step: "确定最小问题", time: "今天" },
          { description: "查找两个公开数据源" },
        ],
        risks: [{ risk: "范围过大" }],
      },
    }, 3);

    expect(plan).toMatchObject({
      version: 3,
      userProfile: "小白用户",
      actionSteps: ["确定最小问题（今天）", "查找两个公开数据源"],
      riskWarnings: ["范围过大"],
    });
  });

  it("persists plan plus Phase 4 document artifacts", () => {
    const sessionId = `pipeline-${Date.now()}`;
    const plan: PlanState = {
      userProfile: "用户有一点 AI 基础",
      problemJudgment: "需要从模糊兴趣收敛到最小研究问题",
      systemLogic: "先验证资料和交付物边界",
      recommendedPath: "一周内完成最小研究计划",
      actionSteps: ["今天写出一个问题", "明天找三条资料"],
      riskWarnings: ["不要直接写论文", "不要扩大范围"],
      nextOptions: ["更简单", "更专业"],
      version: 2,
      isCurrent: true,
    };

    persistPlanArtifacts(sessionId, plan);

    expect(readFile(sessionId, "plan-v2.md")).toContain("# 科研探索计划 v2");
    expect(readFile(sessionId, "summary.md")).toContain("# 当前科研探索摘要");
    expect(readFile(sessionId, "action-checklist.md")).toContain("- [ ] 1. 今天写出一个问题");
    expect(readFile(sessionId, "research-path.md")).toContain("# 科研路径说明");
    expect(getManifest(sessionId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: "plan-v2.md", type: "plan", version: 2 }),
        expect.objectContaining({ filename: "summary.md", type: "summary", version: 2 }),
        expect.objectContaining({ filename: "action-checklist.md", type: "checklist", version: 2 }),
        expect.objectContaining({ filename: "research-path.md", type: "path", version: 2 }),
      ]),
    );
  });

  it("extracts code file artifacts from planning protocol JSON", () => {
    const files = extractCodeFilesFromParsed({
      reply: "ok",
      codeFiles: [
        {
          filename: "planar 2r forward",
          title: "2R 正运动学 MATLAB 脚本",
          language: "matlab",
          content: "L1 = 1;\nL2 = 1;\n",
        },
        {
          filename: "../unsafe.py",
          language: "python",
          code: "print('ok')\n",
        },
      ],
    }, 4);

    expect(files).toEqual([
      expect.objectContaining({
        filename: "code-v4-planar-2r-forward.m",
        title: "2R 正运动学 MATLAB 脚本",
        language: "matlab",
        content: "L1 = 1;\nL2 = 1;\n",
        version: 4,
      }),
      expect.objectContaining({
        filename: "code-v4-unsafe.py",
        language: "python",
        content: "print('ok')\n",
        version: 4,
      }),
    ]);
  });

  it("persists code artifacts beside plan documents", () => {
    const sessionId = `pipeline-code-${Date.now()}`;
    const plan: PlanState = {
      userProfile: "用户需要最小 Demo",
      problemJudgment: "需要输出可运行脚本",
      systemLogic: "代码作为单独产物保存，Plan 只保留执行路径",
      recommendedPath: "先运行脚本验证公式",
      actionSteps: ["保存脚本", "运行脚本"],
      riskWarnings: ["确认本机有 MATLAB 或 Octave"],
      nextOptions: ["更简单"],
      version: 5,
      isCurrent: true,
    };

    persistPlanArtifacts(sessionId, plan, [
      {
        filename: "code-v5-planar_2r_forward.m",
        title: "2R 正运动学脚本",
        language: "matlab",
        content: "disp('ok')\n",
        version: 5,
      },
    ]);

    expect(readFile(sessionId, "code-v5-planar_2r_forward.m")).toBe("disp('ok')\n");
    expect(getManifest(sessionId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: "code-v5-planar_2r_forward.m",
          title: "2R 正运动学脚本",
          type: "code",
          version: 5,
          language: "matlab",
        }),
      ]),
    );
  });
});

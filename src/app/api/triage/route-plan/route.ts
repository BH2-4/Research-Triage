import { NextResponse } from "next/server";

import { buildRoutePlan } from "../../../../lib/route-plan";
import type { RoutePlanRequest, TriageResponse, TriageResult } from "../../../../lib/triage-types";
import { userTypeMap } from "../../../../lib/triage-types";

const answerToCategory: Record<string, TriageResponse["taskCategory"]> = {
  plain_explain: "课题理解",
  execution_focused: "技术路线",
  mvp_planning: "项目Demo",
  research_review: "技术路线",
  anxiety_reduction: "风险审查",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.intake || !body.triage) {
      return NextResponse.json({ error: "缺少 intake 或 triage 数据。" }, { status: 400 });
    }

    // Check if this is AI pipeline format (TriageResult has userType, not userProfile)
    let triage: TriageResponse;

    if ("userType" in body.triage && !("userProfile" in body.triage)) {
      // Convert TriageResult → TriageResponse
      const t = body.triage as TriageResult;
      triage = {
        userProfile: userTypeMap[t.userType],
        taskCategory: answerToCategory[body.route?.answerMode] ?? "技术路线",
        currentStage: (t.taskStage as TriageResponse["currentStage"]) ?? "路线规划期",
        difficulty: t.difficulty,
        riskList: t.riskList,
        plainExplanation: "",
        minimumPath: [],
        recommendedService: "项目路线包",
        serviceReason: "",
        safetyMode: t.riskList.some((r: string) => r.includes("学术诚信") || r.includes("代写") || r.includes("伪造")),
      };
    } else {
      triage = body.triage as TriageResponse;
    }

    const result = buildRoutePlan(body.intake, triage);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/route-plan]", err);
    return NextResponse.json({ error: "路线生成失败，请稍后再试。" }, { status: 500 });
  }
}

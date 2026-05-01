import { NextResponse } from "next/server";

import { buildRoutePlan } from "../../../../lib/route-plan";
import type { RoutePlanRequest } from "../../../../lib/triage-types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RoutePlanRequest;

    if (!body.intake || !body.triage) {
      return NextResponse.json({ error: "缺少 intake 或 triage 数据。" }, { status: 400 });
    }

    const result = buildRoutePlan(body.intake, body.triage);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "路线生成失败，请稍后再试。" }, { status: 500 });
  }
}

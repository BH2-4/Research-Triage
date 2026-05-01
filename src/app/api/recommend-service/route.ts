import { NextResponse } from "next/server";
import { z } from "zod";

import { aiRecommendService } from "../../../lib/ai-triage";
import type { NormalizedInput, TriageResult } from "../../../lib/triage-types";

const schema = z.object({
  triage: z.object({
    userType: z.enum(["A","B","C","D","E"]),
    secondaryType: z.enum(["A","B","C","D","E"]).nullable().optional(),
    confidence: z.number().min(0).max(1),
    taskStage: z.string(), difficulty: z.enum(["低","中","中高","高"]),
    riskList: z.array(z.string()), reason: z.string(),
  }),
  normalized: z.object({
    topic: z.string(), taskType: z.string(), deadline: z.string(),
    userBackground: z.string(), painPoint: z.string(), targetOutput: z.string(),
    missingFields: z.array(z.string()),
  }),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "数据不完整" }, { status: 400 });
    }
    const result = await aiRecommendService(parsed.data.triage as TriageResult, parsed.data.normalized as NormalizedInput);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/recommend-service]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

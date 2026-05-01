import { NextResponse } from "next/server";

import { aiTriageAnalysis } from "../../../lib/ai-triage";
import { intakeSchema } from "../../../lib/triage-types";
import type { IntakeRequest } from "../../../lib/triage-types";
import { triageIntake as ruleTriage } from "../../../lib/triage";

export async function POST(request: Request) {
  let intake: IntakeRequest | null = null;

  try {
    const json = await request.json();
    const parsed = intakeSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "输入不完整。" },
        { status: 400 },
      );
    }

    intake = parsed.data;
    const result = await aiTriageAnalysis(intake);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : "";
    console.error(`[api/triage] ${msg}`, detail);

    // Fallback to rule-based
    if (intake) {
      try {
        return NextResponse.json({ ...ruleTriage(intake), _fallback: true });
      } catch { /* ignore */ }
    }

    return NextResponse.json({ error: `${msg}` }, { status: 500 });
  }
}

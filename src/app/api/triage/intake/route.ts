import { NextResponse } from "next/server";

import { triageIntake } from "../../../../lib/triage";
import { intakeSchema } from "../../../../lib/triage-types";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = intakeSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "输入不完整，请检查表单。",
        },
        { status: 400 },
      );
    }

    const result = triageIntake(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        error: "系统暂时没能完成分诊，请稍后再试。",
      },
      { status: 500 },
    );
  }
}

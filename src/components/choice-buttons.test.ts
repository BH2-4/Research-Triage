import { describe, expect, it } from "vitest";

import { nextChoiceSelection } from "./choice-buttons";
import type { ChoiceGroup } from "../lib/triage-types";

const group: ChoiceGroup = {
  id: "multi",
  mode: "multiple",
  options: [
    { id: "ai", label: "AI 应用", value: "AI 应用" },
    { id: "science", label: "自然科学", value: "自然科学" },
    { id: "escape", label: "我不太理解这些，帮我找方向", value: "我不太理解这些，帮我找方向" },
  ],
};

describe("nextChoiceSelection", () => {
  it("keeps normal multi-select choices until explicit confirm", () => {
    expect(nextChoiceSelection(group, [], "ai")).toEqual(["ai"]);
    expect(nextChoiceSelection(group, ["ai"], "science")).toEqual(["ai", "science"]);
    expect(nextChoiceSelection(group, ["ai", "science"], "ai")).toEqual(["science"]);
  });

  it("makes escape choices mutually exclusive with normal choices", () => {
    expect(nextChoiceSelection(group, ["ai", "science"], "escape")).toEqual(["escape"]);
    expect(nextChoiceSelection(group, ["escape"], "ai")).toEqual(["ai"]);
    expect(nextChoiceSelection(group, ["escape"], "escape")).toEqual([]);
  });
});


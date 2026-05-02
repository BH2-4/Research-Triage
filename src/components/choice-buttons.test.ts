import { describe, expect, it } from "vitest";

import { choiceNeedsSubmit, nextChoiceSelection, nextChoiceState, selectedChoiceSummary } from "./choice-buttons";
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

  it("requires submit for multiple groups even when each group is single-select", () => {
    const groups: ChoiceGroup[] = [
      {
        id: "path",
        mode: "single",
        prompt: "先确认路线",
        options: [
          { id: "model", label: "先按模型学", value: "prefers model-first learning path" },
          { id: "escape-path", label: "我不太理解这些，帮我找方向", value: "我不太理解这些，帮我找方向" },
        ],
      },
      {
        id: "time",
        mode: "single",
        prompt: "再确认时间",
        options: [
          { id: "short", label: "30分钟以内", value: "30分钟以内" },
          { id: "escape-time", label: "我不太理解这些，帮我找方向", value: "我不太理解这些，帮我找方向" },
        ],
      },
    ];

    expect(choiceNeedsSubmit(groups)).toBe(true);
    const first = nextChoiceState(groups, {}, "path", "model");
    expect(first).toEqual({ path: ["model"] });
    const second = nextChoiceState(groups, first, "time", "short");
    expect(second).toEqual({ path: ["model"], time: ["short"] });
    expect(selectedChoiceSummary(groups, second)).toBe(
      "先确认路线：prefers model-first learning path\n再确认时间：30分钟以内",
    );
  });

  it("requires submit for one group when the group itself is multi-select", () => {
    expect(choiceNeedsSubmit([group])).toBe(true);

    const first = nextChoiceState([group], {}, "multi", "ai");
    expect(first).toEqual({ multi: ["ai"] });

    const second = nextChoiceState([group], first, "multi", "science");
    expect(second).toEqual({ multi: ["ai", "science"] });
    expect(selectedChoiceSummary([group], second)).toBe("我选择了：AI 应用、自然科学");
  });

  it("makes escape choices globally exclusive across grouped choices", () => {
    const groups: ChoiceGroup[] = [
      {
        id: "path",
        mode: "single",
        options: [
          { id: "model", label: "先按模型学", value: "prefers model-first learning path" },
          { id: "escape-path", label: "我不太理解这些，帮我找方向", value: "我不太理解这些，帮我找方向" },
        ],
      },
      {
        id: "time",
        mode: "single",
        options: [
          { id: "short", label: "30分钟以内", value: "30分钟以内" },
          { id: "escape-time", label: "我不太理解这些，帮我找方向", value: "我不太理解这些，帮我找方向" },
        ],
      },
    ];

    const selected = nextChoiceState(groups, { path: ["model"], time: ["short"] }, "path", "escape-path");
    expect(selected).toEqual({ path: ["escape-path"] });
    expect(nextChoiceState(groups, selected, "time", "short")).toEqual({ time: ["short"] });
  });
});

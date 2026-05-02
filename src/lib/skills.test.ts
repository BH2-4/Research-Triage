import { describe, expect, it } from "vitest";

import { createEmptyProfile, updateField } from "./memory";
import { buildSystemPrompt, selectSkills } from "./skills";

describe("skill selection", () => {
  it("selects lightweight decomposition skills for novice profiling", () => {
    let memory = createEmptyProfile();
    memory = updateField(memory, "researchFamiliarity", "科研新手", "user_confirmed", 1);
    memory = updateField(memory, "explanationPreference", "希望简单解释", "user_confirmed", 1);

    const selection = selectSkills(memory, "profiling");

    expect(selection.selectedSkills).toEqual(
      expect.arrayContaining([
        "00-core-methodology.md",
        "01-question-decomposition.md",
        "06-ambiguity-surfacing.md",
        "08-communication-protocol.md",
      ]),
    );
  });

  it("adds evidence and peer-review skills for advanced planning", () => {
    let memory = createEmptyProfile();
    memory = updateField(memory, "educationLevel", "硕士", "user_confirmed", 1);
    memory = updateField(memory, "researchFamiliarity", "能读论文", "user_confirmed", 1);
    memory = updateField(memory, "explanationPreference", "更专业", "user_confirmed", 1);

    const selection = selectSkills(memory, "planning");
    const prompt = buildSystemPrompt("任务", selection.selectedSkills);

    expect(selection.selectedSkills).toEqual(
      expect.arrayContaining([
        "03-hypothesis-testing.md",
        "04-evidence-evaluation.md",
        "07-peer-review-simulation.md",
      ]),
    );
    expect(prompt).toContain("## Skill:");
    expect(prompt).toContain("## 当前任务指令");
  });
});


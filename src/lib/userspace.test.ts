import { describe, expect, it } from "vitest";

import { getExistingFilePath, getManifest, readFile, readSessionState, saveCodeFile, saveImageArtifact, saveMarkdownDocument, savePlan, saveSessionState, writeFile } from "./userspace";

describe("userspace", () => {
  it("writes, reads, and records plan files", () => {
    const sessionId = `unit-${Date.now()}`;

    writeFile(sessionId, "hello.md", "# hello");
    expect(readFile(sessionId, "hello.md")).toBe("# hello");

    savePlan(sessionId, 1, "# plan");
    expect(readFile(sessionId, "plan-v1.md")).toBe("# plan");
    expect(getManifest(sessionId)).toContainEqual(
      expect.objectContaining({
        filename: "plan-v1.md",
        title: "科研探索计划 v1",
        type: "plan",
        version: 1,
      }),
    );
  });

  it("rejects unsafe path segments", () => {
    expect(() => writeFile("../escape", "hello.md", "x")).toThrow(/Invalid sessionId/);
    expect(() => writeFile("safe-session", "../escape.md", "x")).toThrow(/Invalid filename/);
    expect(() => readFile("safe-session", "nested/escape.md")).toThrow(/Invalid filename/);
    expect(() => readFile("safe-session", "semi;colon.md")).toThrow(/Invalid filename/);
  });

  it("records Phase 4 document artifact types", () => {
    const sessionId = `docs-${Date.now()}`;

    saveMarkdownDocument(sessionId, "summary.md", "当前科研探索摘要", "summary", "# summary", 2);
    saveMarkdownDocument(sessionId, "action-checklist.md", "行动检查清单", "checklist", "# checklist", 2);
    saveMarkdownDocument(sessionId, "research-path.md", "科研路径说明", "path", "# path", 2);

    expect(getManifest(sessionId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: "summary.md", type: "summary", version: 2 }),
        expect.objectContaining({ filename: "action-checklist.md", type: "checklist", version: 2 }),
        expect.objectContaining({ filename: "research-path.md", type: "path", version: 2 }),
      ]),
    );
  });

  it("records code artifact metadata for browser preview", () => {
    const sessionId = `code-${Date.now()}`;

    saveCodeFile(sessionId, "code-v1-demo.py", "Python Demo", "python", "print('ok')\n", 1);

    expect(readFile(sessionId, "code-v1-demo.py")).toBe("print('ok')\n");
    expect(getExistingFilePath(sessionId, "code-v1-demo.py")).toContain("code-v1-demo.py");
    expect(getManifest(sessionId)).toContainEqual(
      expect.objectContaining({
        filename: "code-v1-demo.py",
        title: "Python Demo",
        type: "code",
        version: 1,
        language: "python",
      }),
    );
  });

  it("enforces a per-file storage limit", () => {
    expect(() => writeFile(`quota-${Date.now()}`, "too-large.md", "x".repeat(256 * 1024 + 1)))
      .toThrow(/per-file userspace limit/);
  });

  it("records image artifact metadata for preview", () => {
    const sessionId = `image-${Date.now()}`;

    saveImageArtifact(sessionId, {
      filename: "image-v1-reference.json",
      title: "Reference Image",
      url: "https://example.com/image.png",
      caption: "示意图",
      source: "example.com",
      alt: "reference",
      version: 1,
    });

    expect(readFile(sessionId, "image-v1-reference.json")).toContain("https://example.com/image.png");
    expect(getManifest(sessionId)).toContainEqual(
      expect.objectContaining({
        filename: "image-v1-reference.json",
        title: "Reference Image",
        type: "image",
        version: 1,
        url: "https://example.com/image.png",
        caption: "示意图",
      }),
    );
  });

  it("saves and reads machine-readable session state", () => {
    const sessionId = `state-${Date.now()}`;

    saveSessionState(sessionId, {
      profile: {
        ageOrGeneration: "Z 世代",
        educationLevel: "本科",
        toolAbility: "会基础工具",
        aiFamiliarity: "常用 AI",
        researchFamiliarity: "新手",
        interestArea: "AI 教育",
        currentBlocker: "不知道怎么开始",
        deviceAvailable: "电脑",
        timeAvailable: "一周",
        explanationPreference: "简单解释",
      },
      profileConfidence: { interestArea: 1 },
      phase: "reviewing",
      progress: {
        phase: "reviewing",
        currentPlanVersion: 2,
        updatedAt: "2026-05-03T00:00:00.000Z",
      },
      preference: {
        explanationPreference: "简单解释",
        interactionPreference: "button",
        outputDetail: "simple",
        updatedAt: "2026-05-03T00:00:00.000Z",
      },
      updatedAt: "2026-05-03T00:00:00.000Z",
    });

    expect(readSessionState(sessionId)).toMatchObject({
      phase: "reviewing",
      progress: { currentPlanVersion: 2 },
      preference: { outputDetail: "simple" },
    });
  });

  it("filters stale manifest entries whose files no longer exist", () => {
    const sessionId = `stale-${Date.now()}`;

    writeFile(sessionId, "manifest.json", JSON.stringify([
      {
        filename: "missing.md",
        title: "Missing",
        type: "summary",
        version: 1,
        createdAt: new Date().toISOString(),
      },
      {
        filename: "existing.md",
        title: "Existing",
        type: "summary",
        version: 1,
        createdAt: new Date().toISOString(),
      },
    ]));
    writeFile(sessionId, "existing.md", "# ok");

    expect(getManifest(sessionId)).toEqual([
      expect.objectContaining({ filename: "existing.md" }),
    ]);
  });
});

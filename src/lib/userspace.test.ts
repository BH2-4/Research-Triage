import { describe, expect, it } from "vitest";

import { getExistingFilePath, getManifest, readFile, saveCodeFile, saveMarkdownDocument, savePlan, writeFile } from "./userspace";

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

  it("records code artifact metadata for preview and external opening", () => {
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

import { describe, expect, it } from "vitest";

import { getManifest, readFile, savePlan, writeFile } from "./userspace";

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
  });
});

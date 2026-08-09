import { afterEach, describe, expect, it, vi } from "vitest";

describe("AI provider safety guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an oversized upstream response", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "x".repeat(32_001) } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.resetModules();
    const { chat } = await import("./ai-provider");

    await expect(chat({ prompt: "hello" })).rejects.toThrow(/size limit/);
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "1000");
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })),
    );
    vi.resetModules();
    const { chat } = await import("./ai-provider");

    await expect(chat({ prompt: "hello" })).rejects.toThrow(/timed out/);
  });
});

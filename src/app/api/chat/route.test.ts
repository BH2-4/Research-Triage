import { describe, expect, it } from "vitest";

import { POST } from "./route";
import { POST as userspacePost } from "../userspace/[sessionId]/[[...filename]]/route";
import { writeFile } from "../../../lib/userspace";

describe("POST /api/chat request guards", () => {
  it("rejects oversized streamed request bodies", async () => {
    const body = JSON.stringify({
      message: "x",
      sessionId: "smoke-session-0001",
      extra: "x".repeat(70_000),
    });

    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(413);
  });

  it("rejects short session IDs before starting a chat turn", async () => {
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello", sessionId: "short" }),
    }));

    expect(response.status).toBe(400);
  });

  it("does not let a client bootstrap header bypass a known session", async () => {
    const sessionId = "bootstrap-auth-test-0001";
    writeFile(sessionId, "state.json", "{}");
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "triage_session=stale-session.invalid",
        "x-session-bootstrap": "1",
      },
      body: JSON.stringify({
        message: "hello",
        sessionId,
      }),
    }));

    expect(response.status).toBe(401);
  });

  it("keeps the server-side system-open action disabled, including on localhost", async () => {
    const response = await userspacePost(
      new Request("http://localhost/api/userspace/smoke-session-0001/missing.txt?action=open", {
        method: "POST",
      }),
      { params: Promise.resolve({ sessionId: "smoke-session-0001", filename: ["missing.txt"] }) },
    );

    expect(response.status).toBe(404);
  });
});

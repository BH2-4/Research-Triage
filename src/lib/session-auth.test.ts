import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { hasValidSessionCookie, setSessionCookie } from "./session-auth";

describe("session ownership cookie", () => {
  it("accepts a signed cookie only for the matching session", () => {
    const sessionId = "session-auth-test-0001";
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, sessionId);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();

    const cookie = setCookie?.split(";")[0] ?? "";
    const request = new Request("http://localhost/api/userspace", {
      headers: { cookie },
    });

    expect(hasValidSessionCookie(request, sessionId)).toBe(true);
    expect(hasValidSessionCookie(request, "session-auth-test-0002")).toBe(false);
  });

  it("rejects unsigned or malformed cookies", () => {
    const request = new Request("http://localhost/api/userspace", {
      headers: { cookie: "triage_session=session-auth-test-0001.not-a-signature" },
    });

    expect(hasValidSessionCookie(request, "session-auth-test-0001")).toBe(false);
  });
});

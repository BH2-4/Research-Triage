import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

import { hasValidSessionCookie, setSessionCookie } from "./session-auth";

afterEach(() => {
  vi.useRealTimers();
});

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

  it("rejects a valid signature after the cookie lifetime", () => {
    vi.useFakeTimers();
    const sessionId = "session-auth-test-0003";
    const issuedAt = new Date("2026-08-09T00:00:00.000Z");
    vi.setSystemTime(issuedAt);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, sessionId);
    const setCookie = response.headers.get("set-cookie");
    const cookie = setCookie?.split(";")[0] ?? "";

    vi.setSystemTime(new Date(issuedAt.getTime() + (7 * 24 * 60 * 60 + 1) * 1000));
    const request = new Request("http://localhost/api/userspace", {
      headers: { cookie },
    });

    expect(hasValidSessionCookie(request, sessionId)).toBe(false);
  });
});

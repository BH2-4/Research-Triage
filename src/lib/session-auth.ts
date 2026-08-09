import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";

const SESSION_COOKIE = "triage_session";
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET?.trim() || randomBytes(32).toString("hex");

function signatureFor(sessionId: string): string {
  return createHmac("sha256", SESSION_COOKIE_SECRET)
    .update(sessionId)
    .digest("base64url");
}

function tokenFor(sessionId: string): string {
  return `${sessionId}.${signatureFor(sessionId)}`;
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const item of header.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === SESSION_COOKIE) return parts.join("=") || null;
  }
  return null;
}

/**
 * Returns true only when the request carries a signed cookie for this session.
 * The session ID remains in the request for client-side state, but the cookie
 * prevents a copied ID from being enough to read another session's files.
 */
export function hasValidSessionCookie(request: Request, sessionId: string): boolean {
  const token = cookieValue(request);
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const tokenSessionId = token.slice(0, separator);
  const receivedSignature = token.slice(separator + 1);
  if (tokenSessionId !== sessionId || !/^[a-zA-Z0-9_-]{16,128}$/.test(tokenSessionId)) return false;

  const expected = Buffer.from(signatureFor(tokenSessionId));
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function hasSessionCookie(request: Request): boolean {
  return cookieValue(request) !== null;
}

export function sessionAuthConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || Boolean(process.env.SESSION_COOKIE_SECRET?.trim());
}

export function setSessionCookie<T extends NextResponse>(response: T, sessionId: string): T {
  response.cookies.set(SESSION_COOKIE, tokenFor(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}

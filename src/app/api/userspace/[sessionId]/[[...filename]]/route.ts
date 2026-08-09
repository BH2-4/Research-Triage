import { NextResponse } from "next/server";
import { hasValidSessionCookie, sessionAuthConfigured } from "../../../../../lib/session-auth";
import { getManifest, readFile } from "../../../../../lib/userspace";

/**
 * GET /api/userspace/{sessionId}
 * GET /api/userspace/{sessionId}/{filename}
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; filename?: string[] }> },
) {
  const { sessionId, filename } = await params;
  const resolvedFilename = filename?.join("/");
  const raw = new URL(request.url).searchParams.get("raw") === "1";

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  if (!sessionAuthConfigured() || !hasValidSessionCookie(request, sessionId)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    if (!resolvedFilename) {
      return NextResponse.json(
        { files: getManifest(sessionId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const content = readFile(sessionId, resolvedFilename);
    if (content === null) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const manifest = getManifest(sessionId);
    const meta = manifest.find((f) => f.filename === resolvedFilename);

    if (raw) {
      return new Response(content, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": meta?.type === "code"
            ? "text/plain; charset=utf-8"
            : meta?.type === "image"
              ? "application/json; charset=utf-8"
              : "text/markdown; charset=utf-8",
          "Content-Disposition": `inline; filename="${resolvedFilename}"`,
        },
      });
    }

    return NextResponse.json(
      {
        filename: resolvedFilename,
        title: meta?.title ?? resolvedFilename.replace(/\.md$/, ""),
        content,
        type: meta?.type ?? "summary",
        version: meta?.version ?? 1,
        language: meta?.language,
        createdAt: meta?.createdAt ?? new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  _request: Request,
  _context: { params: Promise<{ sessionId: string; filename?: string[] }> },
) {
  // Opening a file with the server's operating-system default application is
  // intentionally unavailable. A public web server must never expose a
  // process-launching endpoint; users can preview or download files instead.
  return NextResponse.json({ error: "System open is disabled for this deployment" }, { status: 404 });
}

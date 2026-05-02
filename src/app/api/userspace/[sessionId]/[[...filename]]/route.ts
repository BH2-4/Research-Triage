import { NextResponse } from "next/server";
import { getManifest, openFileWithSystemDefault, readFile } from "../../../../../lib/userspace";

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

  try {
    if (!resolvedFilename) {
      return NextResponse.json({ files: getManifest(sessionId) });
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
          "Content-Type": meta?.type === "code" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
          "Content-Disposition": `inline; filename="${resolvedFilename}"`,
        },
      });
    }

    return NextResponse.json({
      filename: resolvedFilename,
      title: meta?.title ?? resolvedFilename.replace(/\.md$/, ""),
      content,
      type: meta?.type ?? "summary",
      version: meta?.version ?? 1,
      language: meta?.language,
      createdAt: meta?.createdAt ?? new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; filename?: string[] }> },
) {
  const { sessionId, filename } = await params;
  const resolvedFilename = filename?.join("/");
  const action = new URL(request.url).searchParams.get("action");

  if (!sessionId || !resolvedFilename) {
    return NextResponse.json({ error: "Missing sessionId or filename" }, { status: 400 });
  }
  if (action !== "open") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    const result = openFileWithSystemDefault(sessionId, resolvedFilename);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.message === "File not found" ? 404 : 500 },
      );
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { execFileSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import type { FileManifest } from "./triage-types";

const BASE = path.join(process.cwd(), "userspace");

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value) || value.includes("..")) {
    throw new Error(`Invalid ${label}`);
  }
}

function dir(sessionId: string): string {
  assertSafeSegment(sessionId, "sessionId");
  const d = path.join(BASE, sessionId);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function filePath(sessionId: string, filename: string): string {
  assertSafeSegment(filename, "filename");
  const fullPath = path.join(dir(sessionId), filename);
  const resolved = path.resolve(fullPath);
  const root = path.resolve(dir(sessionId));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid filename");
  }
  return resolved;
}

/** Write a file into the user's session directory. */
export function writeFile(
  sessionId: string,
  filename: string,
  content: string,
): string {
  const fullPath = filePath(sessionId, filename);
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

/** Read a file from the user's session directory. Returns null if missing. */
export function readFile(
  sessionId: string,
  filename: string,
): string | null {
  const fullPath = filePath(sessionId, filename);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, "utf-8");
}

export function getExistingFilePath(
  sessionId: string,
  filename: string,
): string | null {
  const fullPath = filePath(sessionId, filename);
  return existsSync(fullPath) ? fullPath : null;
}

function isWsl(): boolean {
  return process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME);
}

function openDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => { /* opening is best-effort */ });
  child.unref();
}

export function openFileWithSystemDefault(
  sessionId: string,
  filename: string,
): { ok: boolean; message: string } {
  const fullPath = getExistingFilePath(sessionId, filename);
  if (!fullPath) {
    return { ok: false, message: "File not found" };
  }

  try {
    if (process.platform === "win32") {
      openDetached("cmd.exe", ["/c", "start", "", fullPath]);
      return { ok: true, message: "Opened with system default app" };
    }

    if (process.platform === "darwin") {
      openDetached("open", [fullPath]);
      return { ok: true, message: "Opened with system default app" };
    }

    if (isWsl()) {
      const windowsPath = execFileSync("wslpath", ["-w", fullPath], {
        encoding: "utf-8",
      }).trim();
      openDetached("cmd.exe", ["/c", "start", "", windowsPath]);
      return { ok: true, message: "Opened with system default app" };
    }

    openDetached("xdg-open", [fullPath]);
    return { ok: true, message: "Opened with system default app" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to open file",
    };
  }
}

/** Get the manifest for a session, creating it if it does not exist. */
export function getManifest(sessionId: string): FileManifest[] {
  const raw = readFile(sessionId, "manifest.json");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FileManifest[];
    return parsed.filter((entry) => {
      try {
        return existsSync(filePath(sessionId, entry.filename));
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** Add or update an entry in the manifest, then write it back to disk. */
export function upsertManifest(
  sessionId: string,
  entry: FileManifest,
): FileManifest[] {
  const items = getManifest(sessionId);
  const idx = items.findIndex((f) => f.filename === entry.filename);
  if (idx >= 0) {
    items[idx] = entry;
  } else {
    items.push(entry);
  }
  const json = JSON.stringify(items, null, 2);
  writeFile(sessionId, "manifest.json", json);
  return items;
}

/** List all .md files in a session (excludes manifest.json). */
export function listFiles(sessionId: string): string[] {
  const d = dir(sessionId);
  return readdirSync(d).filter(
    (f) => f.endsWith(".md") && f !== "manifest.json",
  );
}

/** Save user profile to userspace/profile.md and update manifest. */
export function saveProfile(
  sessionId: string,
  profileMarkdown: string,
): void {
  writeFile(sessionId, "profile.md", profileMarkdown);
  upsertManifest(sessionId, {
    filename: "profile.md",
    title: "用户画像",
    type: "profile",
    version: 1,
    createdAt: new Date().toISOString(),
  });
}

/** Save a plan version to userspace/plan-v{n}.md and update manifest. */
export function savePlan(
  sessionId: string,
  version: number,
  content: string,
  modifiedReason?: string,
): void {
  const filename = `plan-v${version}.md`;
  writeFile(sessionId, filename, content);
  upsertManifest(sessionId, {
    filename,
    title: `科研探索计划 v${version}`,
    type: "plan",
    version,
    createdAt: new Date().toISOString(),
  });
}

/** Save a non-plan markdown artifact into userspace and update manifest. */
export function saveMarkdownDocument(
  sessionId: string,
  filename: string,
  title: string,
  type: Extract<FileManifest["type"], "checklist" | "path" | "summary">,
  content: string,
  version = 1,
): void {
  writeFile(sessionId, filename, content);
  upsertManifest(sessionId, {
    filename,
    title,
    type,
    version,
    createdAt: new Date().toISOString(),
  });
}

export function saveCodeFile(
  sessionId: string,
  filename: string,
  title: string,
  language: string,
  content: string,
  version: number,
): void {
  writeFile(sessionId, filename, content);
  upsertManifest(sessionId, {
    filename,
    title,
    type: "code",
    version,
    createdAt: new Date().toISOString(),
    language,
  });
}

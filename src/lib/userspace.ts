import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { FileManifest, ImageArtifact, PersistedSessionState } from "./triage-types";

const BASE = path.join(process.cwd(), "userspace");
const MAX_SESSION_FILES = 64;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const MAX_GLOBAL_SESSION_ENTRIES = 10_000;
const MAX_GLOBAL_BYTES = 256 * 1024 * 1024;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let lastPruneAt = 0;

function pruneExpiredSessions(): void {
  const now = Date.now();
  if (now - lastPruneAt < 60_000 || !existsSync(BASE)) return;
  lastPruneAt = now;

  for (const entry of readdirSync(BASE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(BASE, entry.name);
    try {
      let lastModified = statSync(sessionDir).mtimeMs;
      for (const filename of readdirSync(sessionDir)) {
        try {
          lastModified = Math.max(lastModified, statSync(path.join(sessionDir, filename)).mtimeMs);
        } catch {
          // Ignore files that disappear while pruning.
        }
      }
      if (now - lastModified > SESSION_TTL_MS) {
        rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch {
      // A concurrent request may remove or replace a session directory.
    }
  }
}

function sessionUsage(sessionDir: string): { files: number; bytes: number } {
  if (!existsSync(sessionDir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const filename of readdirSync(sessionDir)) {
    try {
      const info = statSync(path.join(sessionDir, filename));
      if (info.isFile()) {
        files += 1;
        bytes += info.size;
      }
    } catch {
      // Ignore files that disappear while calculating the quota.
    }
  }
  return { files, bytes };
}

function globalUsage(): { sessions: number; bytes: number } {
  if (!existsSync(BASE)) return { sessions: 0, bytes: 0 };
  let sessions = 0;
  let bytes = 0;
  for (const entry of readdirSync(BASE, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    sessions += 1;
    bytes += sessionUsage(path.join(BASE, entry.name)).bytes;
  }
  return { sessions, bytes };
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_.-]+$/.test(value) || value.includes("..")) {
    throw new Error(`Invalid ${label}`);
  }
}

function dir(sessionId: string, create = true): string {
  assertSafeSegment(sessionId, "sessionId");
  const d = path.join(BASE, sessionId);
  if (create && !existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

function filePath(sessionId: string, filename: string, create = true): string {
  assertSafeSegment(filename, "filename");
  const fullPath = path.join(dir(sessionId, create), filename);
  const resolved = path.resolve(fullPath);
  const root = path.resolve(dir(sessionId, false));
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
  pruneExpiredSessions();
  // Resolve the path without creating a directory. Quota checks must happen
  // before an attacker can create empty session directories.
  const fullPath = filePath(sessionId, filename, false);
  const contentBytes = Buffer.byteLength(content, "utf8");
  if (contentBytes > MAX_FILE_BYTES) {
    throw new Error("File exceeds the per-file userspace limit");
  }

  const sessionDir = dir(sessionId, false);
  const sessionExists = existsSync(sessionDir);
  const existingBytes = existsSync(fullPath) ? statSync(fullPath).size : 0;
  const usage = sessionUsage(sessionDir);
  const global = globalUsage();
  if (!sessionExists && global.sessions >= MAX_GLOBAL_SESSION_ENTRIES) {
    throw new Error("Userspace exceeds the global session limit");
  }
  if (global.bytes - existingBytes + contentBytes > MAX_GLOBAL_BYTES) {
    throw new Error("Userspace exceeds the global storage limit");
  }
  if (!existsSync(fullPath) && usage.files >= MAX_SESSION_FILES) {
    throw new Error("Session exceeds the userspace file limit");
  }
  if (usage.bytes - existingBytes + contentBytes > MAX_SESSION_BYTES) {
    throw new Error("Session exceeds the userspace storage limit");
  }

  if (!sessionExists) mkdirSync(sessionDir, { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

/** Read a file from the user's session directory. Returns null if missing. */
export function readFile(
  sessionId: string,
  filename: string,
): string | null {
  pruneExpiredSessions();
  const fullPath = filePath(sessionId, filename, false);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, "utf-8");
}

export function getExistingFilePath(
  sessionId: string,
  filename: string,
): string | null {
  const fullPath = filePath(sessionId, filename, false);
  return existsSync(fullPath) ? fullPath : null;
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
  pruneExpiredSessions();
  const d = dir(sessionId, false);
  if (!existsSync(d)) return [];
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

export function saveImageArtifact(
  sessionId: string,
  artifact: ImageArtifact,
): void {
  writeFile(sessionId, artifact.filename, JSON.stringify({
    title: artifact.title,
    url: artifact.url,
    source: artifact.source,
    caption: artifact.caption,
    alt: artifact.alt,
    version: artifact.version,
  }, null, 2));
  upsertManifest(sessionId, {
    filename: artifact.filename,
    title: artifact.title,
    type: "image",
    version: artifact.version,
    createdAt: new Date().toISOString(),
    url: artifact.url,
    source: artifact.source,
    caption: artifact.caption,
    alt: artifact.alt,
  });
}

export function saveSessionState(
  sessionId: string,
  state: PersistedSessionState,
): void {
  writeFile(sessionId, "state.json", JSON.stringify(state, null, 2));
}

export function readSessionState(sessionId: string): PersistedSessionState | null {
  const raw = readFile(sessionId, "state.json");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSessionState;
  } catch {
    return null;
  }
}

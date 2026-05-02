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

/** Get the manifest for a session, creating it if it does not exist. */
export function getManifest(sessionId: string): FileManifest[] {
  const raw = readFile(sessionId, "manifest.json");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as FileManifest[];
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

import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

let cachedSkills: string | null = null;

/** Load all skills from disk, sorted by prefix. Cached after first call. */
export function loadSkills(): string {
  if (cachedSkills) return cachedSkills;

  if (!existsSync(SKILLS_DIR)) {
    console.warn("[skills] skills/ directory not found, skills disabled");
    cachedSkills = "";
    return cachedSkills;
  }

  const files = readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.warn("[skills] no .md files in skills/, skills disabled");
    cachedSkills = "";
    return cachedSkills;
  }

  cachedSkills = files
    .map((f) => {
      const raw = readFileSync(path.join(SKILLS_DIR, f), "utf-8");
      return `## Skill: ${f.replace(/^\d+-/, "").replace(/\.md$/, "")}\n\n${raw}`;
    })
    .join("\n\n---\n\n");

  console.log(`[skills] loaded ${files.length} skills (${cachedSkills.length} chars)`);
  return cachedSkills;
}

/** Build complete system prompt: skills preamble + task instruction. */
export function buildSystemPrompt(taskInstruction: string): string {
  const skills = loadSkills();
  if (!skills) return taskInstruction;
  return `${skills}\n\n---\n\n## 当前任务指令\n\n${taskInstruction}`;
}

/** Force reload (for hot-reload during dev). */
export function reloadSkills(): string {
  cachedSkills = null;
  return loadSkills();
}

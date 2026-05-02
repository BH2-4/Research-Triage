import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import type { UserProfileMemory } from "./memory";
import type { Phase, PlanState } from "./triage-types";

const SKILLS_DIR = path.join(process.cwd(), "skills");

let cachedSkills: string | null = null;
let cachedSkillFiles: Array<{ filename: string; key: string; content: string }> | null = null;

function skillKey(filename: string): string {
  return filename.replace(/^\d+-/, "").replace(/\.md$/, "");
}

function readSkillFiles(): Array<{ filename: string; key: string; content: string }> {
  if (cachedSkillFiles) return cachedSkillFiles;

  if (!existsSync(SKILLS_DIR)) {
    console.warn("[skills] skills/ directory not found, skills disabled");
    cachedSkillFiles = [];
    return cachedSkillFiles;
  }

  const files = readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  cachedSkillFiles = files.map((filename) => ({
    filename,
    key: skillKey(filename),
    content: readFileSync(path.join(SKILLS_DIR, filename), "utf-8"),
  }));

  if (cachedSkillFiles.length === 0) {
    console.warn("[skills] no .md files in skills/, skills disabled");
  }

  return cachedSkillFiles;
}

/** Load all skills from disk, sorted by prefix. Cached after first call. */
export function loadSkills(selectedSkills?: string[]): string {
  if (!selectedSkills && cachedSkills) return cachedSkills;

  const selected = selectedSkills ? new Set(selectedSkills) : null;
  const blocks = readSkillFiles()
    .filter((file) => !selected || selected.has(file.filename) || selected.has(file.key))
    .map((file) => `## Skill: ${file.key}\n\n${file.content}`)
    .join("\n\n---\n\n");

  if (!selectedSkills) {
    cachedSkills = blocks;
    console.log(`[skills] loaded ${readSkillFiles().length} skills (${cachedSkills.length} chars)`);
  }

  return blocks;
}

export function selectSkills(
  memory: UserProfileMemory,
  phase: Phase,
  plan?: PlanState,
): { selectedSkills: string[]; reason: string } {
  const selected = new Set<string>([
    "00-core-methodology.md",
    "08-communication-protocol.md",
    "09-safety-boundary.md",
  ]);

  if (phase === "greeting" || phase === "profiling" || phase === "clarifying") {
    selected.add("01-question-decomposition.md");
    selected.add("02-knowledge-gap-analysis.md");
    selected.add("06-ambiguity-surfacing.md");
  }

  if (phase === "planning" || phase === "reviewing" || plan) {
    selected.add("03-hypothesis-testing.md");
    selected.add("04-evidence-evaluation.md");
    selected.add("05-iterative-refinement.md");
  }

  const noviceSignals = [
    memory.researchFamiliarity.value,
    memory.toolAbility.value,
    memory.explanationPreference.value,
  ].join(" ");
  if (/小白|新手|从零|简单|不懂/.test(noviceSignals)) {
    selected.add("01-question-decomposition.md");
    selected.add("06-ambiguity-surfacing.md");
  }

  const advancedSignals = [
    memory.researchFamiliarity.value,
    memory.educationLevel.value,
    memory.explanationPreference.value,
  ].join(" ");
  if (/论文|实验|专业|研究|导师|本科|硕士|博士/.test(advancedSignals)) {
    selected.add("04-evidence-evaluation.md");
    selected.add("07-peer-review-simulation.md");
  }

  if (/紧|三天|3 天|一周|1 周|ddl|deadline/i.test(memory.timeAvailable.value)) {
    selected.add("05-iterative-refinement.md");
  }

  const files = readSkillFiles();
  const available = new Set(files.map((file) => file.filename));
  const selectedSkills = [...selected].filter((filename) => available.has(filename));

  return {
    selectedSkills,
    reason: `phase=${phase}; reliable-skill-count=${selectedSkills.length}`,
  };
}

/** Build complete system prompt: skills preamble + task instruction. */
export function buildSystemPrompt(taskInstruction: string, selectedSkills?: string[]): string {
  const skills = loadSkills(selectedSkills);
  if (!skills) return taskInstruction;
  return `${skills}\n\n---\n\n## 当前任务指令\n\n${taskInstruction}`;
}

/** Force reload (for hot-reload during dev). */
export function reloadSkills(): string {
  cachedSkills = null;
  cachedSkillFiles = null;
  return loadSkills();
}

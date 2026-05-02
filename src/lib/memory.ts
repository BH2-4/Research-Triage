import type { UserProfileState } from "./triage-types";

/** Confidence-tagged profile field. */
export type ProfileField = {
  value: string;
  confidence: number; // 0.0=guess, 0.5=AI-judged, 0.7=user-hinted, 1.0=confirmed
  source: "inferred" | "deduced" | "user_confirmed";
  updatedAt: number;
};

/** Internal memory representation with confidence per field. */
export type UserProfileMemory = Record<keyof UserProfileState, ProfileField>;

const KEYS: (keyof UserProfileState)[] = [
  "ageOrGeneration",
  "educationLevel",
  "toolAbility",
  "aiFamiliarity",
  "researchFamiliarity",
  "interestArea",
  "currentBlocker",
  "deviceAvailable",
  "timeAvailable",
  "explanationPreference",
];

export function createEmptyProfile(): UserProfileMemory {
  const now = Date.now();
  return Object.fromEntries(
    KEYS.map((k) => [
      k,
      { value: "", confidence: 0, source: "inferred" as const, updatedAt: now },
    ]),
  ) as UserProfileMemory;
}

export function updateField(
  memory: UserProfileMemory,
  field: keyof UserProfileState,
  value: string,
  source: ProfileField["source"],
  confidence: number,
): UserProfileMemory {
  return {
    ...memory,
    [field]: { value, confidence, source, updatedAt: Date.now() },
  };
}

/** Fields with confidence >= 0.3 (at least some signal). */
export function getDetectedFields(memory: UserProfileMemory): string[] {
  return KEYS.filter((k) => memory[k].value && memory[k].confidence >= 0.3);
}

/** Fields with confidence >= 0.7 (reliable enough for Plan foundation). */
export function getReliableFields(memory: UserProfileMemory): string[] {
  return KEYS.filter((k) => memory[k].value && memory[k].confidence >= 0.7);
}

/** Profile ready when >= 6 fields have confidence >= 0.7. */
export function isProfileReady(memory: UserProfileMemory): boolean {
  return getReliableFields(memory).length >= 6;
}

/** Flatten memory → API-safe UserProfileState. */
export function toAPIState(memory: UserProfileMemory): UserProfileState {
  return Object.fromEntries(
    KEYS.map((k) => [k, memory[k].value]),
  ) as unknown as UserProfileState;
}

/** Build a markdown summary of the profile for userspace/profile.md. */
export function profileToMarkdown(memory: UserProfileMemory): string {
  const lines = ["# 用户画像", ""];
  const label: Record<keyof UserProfileState, string> = {
    ageOrGeneration: "年龄段",
    educationLevel: "教育水平",
    toolAbility: "工具能力",
    aiFamiliarity: "AI 熟悉度",
    researchFamiliarity: "科研理解度",
    interestArea: "兴趣方向",
    currentBlocker: "当前卡点",
    deviceAvailable: "可用设备",
    timeAvailable: "可用时间",
    explanationPreference: "解释偏好",
  };
  for (const k of KEYS) {
    const f = memory[k];
    const icon = f.confidence >= 1 ? "✅" : f.confidence >= 0.5 ? "🔍" : "❓";
    lines.push(`- ${icon} **${label[k]}**: ${f.value || "（未识别）"}`);
  }
  return lines.join("\n");
}

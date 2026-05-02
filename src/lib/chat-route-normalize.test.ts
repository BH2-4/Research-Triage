import { describe, expect, it } from "vitest";

function splitInlineSubOptions(question: string): string[] {
  const normalized = question
    .replace(/\s+/g, " ")
    .replace(/([:：；;])\s*([A-D])\./g, "$1\n$2.")
    .replace(/([:：；;])\s*([A-D])[)）]/g, "$1\n$2.")
    .trim();

  const parts = normalized
    .split(/\n(?=[A-D]\.)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [question.trim()];

  const stemMatch = normalized.match(/^(.*?)(?:[:：]\s*)?(?=\n?[A-D]\.)/);
  const stem = stemMatch?.[1]?.trim().replace(/[：:]$/, "") ?? "";
  if (!stem) return [question.trim()];

  const results = parts
    .map((part) => part.replace(/^[A-D]\.\s*/, "").trim())
    .filter((part) => part !== stem && part !== `${stem}：` && part !== `${stem}:`)
    .filter(Boolean)
    .map((part) => `${stem}：${part}`);

  return results.length > 0 ? results : [question.trim()];
}

function isQuestionStemOnly(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length < 3) return false;
  if (!/[？?]$/.test(trimmed)) return false;
  return !/[；;。.!！]/.test(trimmed.slice(0, -1));
}

function normalizeQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const flattened = raw
    .flatMap((item) => {
      if (typeof item !== "string") return [];
      return splitInlineSubOptions(item);
    })
    .map((item) => item.trim())
    .filter(Boolean);

  const deduped: string[] = [];
  for (const item of flattened) {
    if (!deduped.includes(item)) deduped.push(item);
  }

  return deduped.filter((item, index, arr) => {
    if (!isQuestionStemOnly(item)) return true;
    return !arr.some((candidate) => candidate !== item && candidate.startsWith(item.replace(/[？?]$/, "")));
  });
}

describe("normalizeQuestions", () => {
  it("splits one question containing A/B/C sub-options into clickable facts", () => {
    const normalized = normalizeQuestions([
      "你对MATLAB/Simulink的熟悉程度是：A.熟练使用；B.基本了解但需要参考教程；C.从未用过，愿意从零学",
    ]);

    expect(normalized).toEqual([
      "你对MATLAB/Simulink的熟悉程度是：熟练使用；",
      "你对MATLAB/Simulink的熟悉程度是：基本了解但需要参考教程；",
      "你对MATLAB/Simulink的熟悉程度是：从未用过，愿意从零学",
    ]);
  });

  it("removes a stem-only question when concrete options exist", () => {
    const normalized = normalizeQuestions([
      "接下来你想要明确的问题？",
      "接下来你想要明确的问题：你对matlab/simulink的熟悉程度？",
      "接下来你想要明确的问题：你希望先看懂模型还是先跑通最小demo？",
    ]);

    expect(normalized).toEqual([
      "接下来你想要明确的问题：你对matlab/simulink的熟悉程度？",
      "接下来你想要明确的问题：你希望先看懂模型还是先跑通最小demo？",
    ]);
  });
});

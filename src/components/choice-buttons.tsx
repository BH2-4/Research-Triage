"use client";

import { useMemo, useState } from "react";
import type { ChoiceGroup } from "../lib/triage-types";

type Props = {
  questions: string[];
  choiceGroups?: ChoiceGroup[];
  onSelect: (text: string) => void;
  disabled?: boolean;
};

/** Filter out placeholder-like options ("选项A", "其他", etc.) */
function isValidOption(q: string): boolean {
  if (q.length < 3) return false;
  if (/^选项\s*[a-dA-D]$/.test(q.trim())) return false;
  if (/^[a-dA-D][).、]/.test(q.trim())) return false;
  if (q.trim() === "其他" || q.trim() === "其它") return false;
  if (/[：:].*[A-D][.)].*[A-D][.)]/.test(q)) return false;
  return true;
}

function legacyChoiceGroup(questions: string[]): ChoiceGroup[] {
  const valid = questions.filter(isValidOption);
  const hasEscape = valid.some(
    (q) =>
      q.includes("帮我找方向") ||
      q.includes("自己描述") ||
      q.includes("自定义"),
  );

  const display = hasEscape ? valid : [...valid, "我不太理解这些，帮我找方向"];
  if (display.length === 0) return [];

  return [{
    id: "legacy-questions",
    mode: "single",
    options: display.map((q, i) => ({
      id: `legacy-${i + 1}`,
      label: q,
      value: q,
    })),
  }];
}

function selectedSummary(group: ChoiceGroup, selectedIds: Set<string>): string {
  const selected = group.options
    .filter((option) => selectedIds.has(option.id))
    .map((option) => option.value);

  if (selected.length === 0) return "";
  const prefix = group.prompt ? `${group.prompt}：` : "我选择了：";
  return `${prefix}${selected.join("、")}`;
}

function isEscapeOptionValue(value: string): boolean {
  return value.includes("帮我找方向") ||
    value.includes("自己描述") ||
    value.includes("自定义") ||
    value.includes("不太理解");
}

export function nextChoiceSelection(
  group: ChoiceGroup,
  currentIds: string[],
  optionId: string,
): string[] {
  const option = group.options.find((item) => item.id === optionId);
  if (!option) return currentIds;

  const escapeIds = new Set(
    group.options
      .filter((item) => isEscapeOptionValue(item.value))
      .map((item) => item.id),
  );
  const isEscape = escapeIds.has(optionId);
  const current = new Set(currentIds);

  if (isEscape) {
    return current.has(optionId) ? [] : [optionId];
  }

  for (const escapeId of escapeIds) current.delete(escapeId);
  if (current.has(optionId)) current.delete(optionId);
  else current.add(optionId);
  return [...current];
}

export function ChoiceButtons({ questions, choiceGroups, onSelect, disabled }: Props) {
  const groups = useMemo(
    () => (choiceGroups && choiceGroups.length > 0 ? choiceGroups : legacyChoiceGroup(questions)),
    [choiceGroups, questions],
  );
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  if (groups.length === 0) return null;

  const toggle = (group: ChoiceGroup, optionId: string) => {
    if (disabled) return;
    setSelectedByGroup((prev) => {
      return { ...prev, [group.id]: nextChoiceSelection(group, prev[group.id] ?? [], optionId) };
    });
  };

  const confirm = (group: ChoiceGroup) => {
    const selectedIds = new Set(selectedByGroup[group.id] ?? []);
    const summary = selectedSummary(group, selectedIds);
    if (!summary || disabled) return;
    onSelect(summary);
  };

  return (
    <div className="choice-buttons">
      {groups.map((group) => {
        const selectedIds = new Set(selectedByGroup[group.id] ?? []);
        return (
          <div key={group.id} className="choice-group" data-mode={group.mode}>
            {group.prompt && <div className="choice-group-prompt">{group.prompt}</div>}
            <div className="choice-group-options">
              {group.options.map((option) => {
                const selected = selectedIds.has(option.id) || option.selected === true;
                const isEscape = isEscapeOptionValue(option.value);
                return (
                  <button
                    key={option.id}
                    className={`button button-choice${isEscape ? " button-choice-escape" : ""}${selected ? " button-choice-selected" : ""}`}
                    type="button"
                    aria-pressed={group.mode === "multiple" ? selected : undefined}
                    disabled={disabled}
                    onClick={() => {
                      if (group.mode === "multiple") {
                        toggle(group, option.id);
                      } else {
                        onSelect(option.value);
                      }
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {group.mode === "multiple" && (
              <div className="choice-confirm-row">
                <span className="choice-selected-text">
                  {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : "可多选"}
                </span>
                <button
                  className="button button-choice-confirm"
                  type="button"
                  disabled={disabled || selectedIds.size === 0}
                  onClick={() => confirm(group)}
                >
                  {group.confirmLabel ?? "确认选择"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

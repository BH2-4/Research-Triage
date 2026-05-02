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

function isEscapeOptionValue(value: string): boolean {
  return value.includes("帮我找方向") ||
    value.includes("自己描述") ||
    value.includes("自定义") ||
    value.includes("不太理解");
}

function legacyChoiceGroup(questions: string[]): ChoiceGroup[] {
  const valid = questions.filter(isValidOption);
  const display: string[] = [];
  let hasEscape = false;
  for (const item of valid) {
    if (isEscapeOptionValue(item)) {
      if (hasEscape) continue;
      display.push("我不太理解这些，帮我找方向");
      hasEscape = true;
    } else {
      display.push(item);
    }
  }
  if (!hasEscape) display.push("我不太理解这些，帮我找方向");
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

type ChoiceSelectionState = Record<string, string[]>;

function initialChoiceState(groups: ChoiceGroup[]): ChoiceSelectionState {
  const initial: ChoiceSelectionState = {};
  for (const group of groups) {
    const selectedIds = group.options
      .filter((option) => option.selected === true)
      .map((option) => option.id);
    if (selectedIds.length > 0) {
      initial[group.id] = group.mode === "multiple" ? selectedIds : selectedIds.slice(0, 1);
    }
  }
  return initial;
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

export function choiceNeedsSubmit(groups: ChoiceGroup[]): boolean {
  return groups.length > 1 || groups.some((group) => group.mode === "multiple");
}

export function nextChoiceState(
  groups: ChoiceGroup[],
  current: ChoiceSelectionState,
  groupId: string,
  optionId: string,
): ChoiceSelectionState {
  const group = groups.find((item) => item.id === groupId);
  const option = group?.options.find((item) => item.id === optionId);
  if (!group || !option) return current;

  const isEscape = isEscapeOptionValue(option.value);
  const wasSelected = (current[groupId] ?? []).includes(optionId);
  if (isEscape) {
    return wasSelected ? { ...current, [groupId]: [] } : { [groupId]: [optionId] };
  }

  const withoutEscapes: ChoiceSelectionState = {};
  for (const candidateGroup of groups) {
    const escapeIds = new Set(
      candidateGroup.options
        .filter((item) => isEscapeOptionValue(item.value))
        .map((item) => item.id),
    );
    const kept = (current[candidateGroup.id] ?? []).filter((id) => !escapeIds.has(id));
    if (kept.length > 0) withoutEscapes[candidateGroup.id] = kept;
  }

  if (group.mode === "multiple") {
    return {
      ...withoutEscapes,
      [groupId]: nextChoiceSelection(group, withoutEscapes[groupId] ?? [], optionId),
    };
  }

  return {
    ...withoutEscapes,
    [groupId]: wasSelected ? [] : [optionId],
  };
}

export function selectedChoiceSummary(groups: ChoiceGroup[], selectedByGroup: ChoiceSelectionState): string {
  return groups
    .map((group) => selectedSummary(group, new Set(selectedByGroup[group.id] ?? [])))
    .filter(Boolean)
    .join("\n");
}

export function choiceSelectionReady(groups: ChoiceGroup[], selectedByGroup: ChoiceSelectionState): boolean {
  const selectedOptions = groups.flatMap((group) =>
    group.options.filter((option) => (selectedByGroup[group.id] ?? []).includes(option.id)),
  );
  if (selectedOptions.length === 0) return false;
  if (selectedOptions.some((option) => isEscapeOptionValue(option.value))) return selectedOptions.length === 1;
  if (groups.length <= 1) return true;
  return groups.every((group) => (selectedByGroup[group.id] ?? []).length > 0);
}

export function ChoiceButtons({ questions, choiceGroups, onSelect, disabled }: Props) {
  const groups = useMemo(
    () => (choiceGroups && choiceGroups.length > 0 ? choiceGroups : legacyChoiceGroup(questions)),
    [choiceGroups, questions],
  );
  const [selectedByGroup, setSelectedByGroup] = useState<ChoiceSelectionState>(() => initialChoiceState(groups));

  if (groups.length === 0) return null;

  const needsSubmit = choiceNeedsSubmit(groups);
  const selectionReady = choiceSelectionReady(groups, selectedByGroup);
  const confirmLabel = groups.find((group) => group.confirmLabel)?.confirmLabel ?? "确认选择";

  const toggle = (group: ChoiceGroup, optionId: string) => {
    if (disabled) return;
    setSelectedByGroup((prev) => nextChoiceState(groups, prev, group.id, optionId));
  };

  const confirmAll = () => {
    const summary = selectedChoiceSummary(groups, selectedByGroup);
    if (!summary || !selectionReady || disabled) return;
    onSelect(summary);
  };

  const selectedCount = Object.values(selectedByGroup).reduce((count, ids) => count + ids.length, 0);

  return (
    <div className="choice-buttons">
      {groups.map((group) => {
        const selectedIds = new Set(selectedByGroup[group.id] ?? []);
        return (
          <div key={group.id} className="choice-group" data-mode={group.mode}>
            {group.prompt && <div className="choice-group-prompt">{group.prompt}</div>}
            <div className="choice-group-options">
              {group.options.map((option) => {
                const selected = selectedIds.has(option.id);
                const isEscape = isEscapeOptionValue(option.value);
                return (
                  <button
                    key={option.id}
                    className={`button button-choice${isEscape ? " button-choice-escape" : ""}${selected ? " button-choice-selected" : ""}`}
                    type="button"
                    aria-pressed={needsSubmit ? selected : undefined}
                    disabled={disabled}
                    onClick={() => {
                      if (needsSubmit) {
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
          </div>
        );
      })}
      {needsSubmit && (
        <div className="choice-confirm-row choice-confirm-row--global">
          <span className="choice-selected-text">
            {selectedCount > 0 ? `已选 ${selectedCount} 项` : "请先选择"}
          </span>
          <button
            className="button button-choice-confirm"
            type="button"
            disabled={disabled || !selectionReady}
            onClick={confirmAll}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}

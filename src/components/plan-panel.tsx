"use client";

import { useState } from "react";
import { marked } from "marked";
import type { PlanState } from "../lib/triage-types";

type Props = {
  plan: PlanState;
  onAction?: (message: string) => void;
  disabled?: boolean;
};

type SectionKey = "profile" | "problem" | "logic" | "path" | "steps" | "risks";

export function PlanPanel({ plan, onAction, disabled }: Props) {
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());

  const toggle = (key: SectionKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isOpen = (key: SectionKey) => !collapsed.has(key);
  const sendStepAction = (index: number, step: string, action: string) => {
    onAction?.(`请把科研探索计划 v${plan.version} 的第 ${index + 1} 步调整为「${action}」。原步骤：${step}`);
  };

  const sendPlanAction = (action: string) => {
    onAction?.(`请根据当前科研探索计划 v${plan.version} 做调整：${action}`);
  };

  return (
    <div className="panel plan-panel">
      <div className="plan-header">
        <span className="eyebrow">科研探索计划 v{plan.version}</span>
        {plan.modifiedReason && (
          <span className="plan-version-note">修改原因：{plan.modifiedReason}</span>
        )}
      </div>

      {/* Profile */}
      <Section
        title="📋 用户画像"
        open={isOpen("profile")}
        onToggle={() => toggle("profile")}
      >
        <div className="plan-md" dangerouslySetInnerHTML={{ __html: marked.parse(plan.userProfile) }} />
      </Section>

      {/* Problem Judgment */}
      <Section
        title="🔍 问题判断"
        open={isOpen("problem")}
        onToggle={() => toggle("problem")}
      >
        <div className="plan-md" dangerouslySetInnerHTML={{ __html: marked.parse(plan.problemJudgment) }} />
      </Section>

      {/* System Logic */}
      <Section
        title="🧠 系统逻辑"
        open={isOpen("logic")}
        onToggle={() => toggle("logic")}
      >
        <div className="plan-md muted" dangerouslySetInnerHTML={{ __html: marked.parse(plan.systemLogic) }} />
      </Section>

      {/* Recommended Path */}
      <Section
        title="🗺 推荐路径"
        open={isOpen("path")}
        onToggle={() => toggle("path")}
      >
        <div className="plan-md" dangerouslySetInnerHTML={{ __html: marked.parse(plan.recommendedPath) }} />
      </Section>

      {/* Action Steps */}
      <Section
        title={`📝 行动步骤（${plan.actionSteps.length}步）`}
        open={isOpen("steps")}
        onToggle={() => toggle("steps")}
      >
        <ol className="plan-steps-list">
          {plan.actionSteps.map((step, i) => (
            <li key={i} className="plan-step-item">
              <span>{step}</span>
              <div className="plan-step-actions">
                {["更简单", "更专业", "拆开讲", "换方向"].map((action) => (
                  <button
                    key={action}
                    className="plan-step-btn"
                    type="button"
                    disabled={disabled || !onAction}
                    onClick={() => sendStepAction(i, step, action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Risk Warnings */}
      <Section
        title={`⚠ 风险提示（${plan.riskWarnings.length}条）`}
        open={isOpen("risks")}
        onToggle={() => toggle("risks")}
      >
        <ul className="bullet-list">
          {plan.riskWarnings.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </Section>

      {/* Next Options */}
      <div className="plan-section">
        <h3>下一步</h3>
        <div className="choice-buttons">
          {plan.nextOptions.map((opt, i) => (
            <button
              key={i}
              className="button button-choice"
              type="button"
              disabled={disabled || !onAction}
              onClick={() => sendPlanAction(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="plan-section">
      <button className="plan-section-toggle" type="button" onClick={onToggle}>
        <span className="plan-section-arrow">{open ? "▼" : "▶"}</span>
        <h3>{title}</h3>
      </button>
      {open && <div className="plan-section-body">{children}</div>}
    </div>
  );
}

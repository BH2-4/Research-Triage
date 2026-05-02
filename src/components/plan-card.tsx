"use client";

import { useMemo, useState } from "react";

export type PlanOption = {
  id: string;
  title: string;
  description: string;
  actionHint: string;
  split?: PlanOption[];
};

type PlanCardProps = {
  goal: string;
  recommendation: string;
  options: PlanOption[];
  onSelect?: (optionId: string) => void;
};

export function PlanCard({ goal, recommendation, options, onSelect }: PlanCardProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(true);

  const focusedOption = useMemo(() => options.find((item) => item.id === focusId) ?? null, [focusId, options]);

  return (
    <article className="panel card-stack plan-card">
      <span className="eyebrow">Plan 模式</span>
      <h2>下一步不靠猜，先选路径</h2>
      <p>
        <strong>当前目标：</strong>
        {goal}
      </p>
      <p className="muted">
        <strong>默认推荐：</strong>
        {recommendation}
      </p>

      <div className="plan-options">
        {options.map((option) => (
          <div className="plan-option" key={option.id}>
            <div>
              <strong>
                {option.id}. {option.title}
              </strong>
              <p className="muted">{option.description}</p>
            </div>
            <div className="plan-actions">
              <button className="button button-secondary" onClick={() => onSelect?.(option.id)} type="button">
                选择
              </button>
              <button className="button button-ghost" onClick={() => setFocusId(option.id)} type="button">
                拆分/解释
              </button>
            </div>
          </div>
        ))}
      </div>

      {focusedOption ? (
        <div className="plan-focus">
          <div className="pill-row" style={{ marginTop: 0 }}>
            <button className="button button-secondary" onClick={() => setSimpleMode(true)} type="button">
              简单解释
            </button>
            <button className="button button-secondary" onClick={() => setSimpleMode(false)} type="button">
              收敛推荐
            </button>
          </div>
          <p>
            <strong>{simpleMode ? "简单版" : "收敛版"}：</strong>
            {simpleMode ? focusedOption.description : focusedOption.actionHint}
          </p>
          {focusedOption.split?.length ? (
            <ul className="bullet-list">
              {focusedOption.split.map((item) => (
                <li key={item.id}>
                  <strong>{item.id}</strong>：{item.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

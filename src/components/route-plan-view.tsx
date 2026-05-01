"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { lastIntakeKey, lastResultKey, lastRoutePlanKey, loadJson, saveJson } from "../lib/storage";
import type { IntakeRequest, RoutePlanResponse, TriageResponse } from "../lib/triage-types";

export function RoutePlanView() {
  const [plan, setPlan] = useState<RoutePlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cached = loadJson<RoutePlanResponse>(lastRoutePlanKey);
    if (cached) {
      setPlan(cached);
      return;
    }

    const intake = loadJson<IntakeRequest>(lastIntakeKey);
    const triage = loadJson<TriageResponse>(lastResultKey);

    if (!intake || !triage) return;

    setLoading(true);
    fetch("/api/triage/route-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake, triage }),
    })
      .then((res) => res.json())
      .then((data: RoutePlanResponse) => {
        saveJson(lastRoutePlanKey, data);
        setPlan(data);
      })
      .catch(() => setError("路线生成失败，请返回结果页重试。"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="panel result-shell empty-state">
        <span className="eyebrow">正在生成</span>
        <h1>正在整理完整项目路线</h1>
        <p>系统正在根据你的分诊结果生成课题拆解、阶段计划和兜底方案。</p>
      </section>
    );
  }

  if (error || !plan) {
    return (
      <section className="panel result-shell empty-state">
        <span className="eyebrow">暂无路线</span>
        <h1>{error || "还没有可展示的项目路线"}</h1>
        <p>请先完成分诊，再进入路线页查看完整执行方案。</p>
        <div className="actions">
          <Link className="button button-primary" href="/result">
            返回分诊结果
          </Link>
          <Link className="button button-secondary" href="/intake">
            重新填写表单
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="result-shell">
      <div className="panel result-hero">
        <span className="eyebrow">完整项目路线</span>
        <h1>从分诊结果到可执行方案</h1>
        <p>{plan.overview}</p>
      </div>

      <div className="result-grid">
        <article className="panel card-stack">
          <span className="eyebrow">1. 交付物清单</span>
          <h2>你需要产出什么</h2>
          <ul className="bullet-list">
            {plan.deliverables.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">2. 阶段计划</span>
          <h2>分阶段执行路线</h2>
          {plan.routeSteps.map((step) => (
            <div key={step.phase} className="route-phase">
              <strong className="phase-label">{step.phase}</strong>
              <ul className="bullet-list">
                {step.tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          ))}
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">3. 风险与兜底</span>
          <h2>做不成 A，还有 B</h2>
          <ul className="bullet-list">
            {plan.fallbackPlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">4. 汇报口径</span>
          <h2>怎样向老师解释</h2>
          <ul className="bullet-list">
            {plan.teacherTalkingPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      </div>

      <div className="panel cta-strip">
        <div className="actions wrap-actions">
          <Link className="button button-primary" href="/result">
            返回分诊结果
          </Link>
          <Link className="button button-secondary" href="/intake">
            重新填写表单
          </Link>
        </div>
      </div>
    </section>
  );
}

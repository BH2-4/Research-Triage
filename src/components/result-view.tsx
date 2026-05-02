"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadJson, lastAiAnswerKey, lastAiTriageKey, lastPlanStateKey, lastResultKey, saveJson } from "../lib/storage";
import type {
  AiTriageResponse,
  GeneratedAnswer,
  QualityCheck,
  ServiceRecommendation,
  TriageResponse,
} from "../lib/triage-types";
import { userTypeMap } from "../lib/triage-types";
import { PlanCard, type PlanOption } from "./plan-card";


const defaultPlanOptions: PlanOption[] = [
  {
    id: "A",
    title: "直接生成首页结构",
    description: "适合已经知道自己要展示什么的团队，直接进入页面模块输出。",
    actionHint: "P0 先做输入区、Plan 卡片、结果区三块，今天内可出线框。",
  },
  {
    id: "B",
    title: "先拆解首页目标",
    description: "先明确首页是给谁看的，再决定讲创新、痛点还是商业价值。",
    actionHint: "先锁定“黑客松评委”场景，只保留可展示和可验证的信息。",
    split: [
      { id: "B1", title: "面向评委", description: "", actionHint: "" },
      { id: "B2", title: "面向用户", description: "", actionHint: "" },
      { id: "B3", title: "面向团队", description: "", actionHint: "" },
    ],
  },
  {
    id: "C",
    title: "先看竞品和参考",
    description: "先收集 3-5 个参考案例，降低设计和信息结构决策成本。",
    actionHint: "先做竞品卡片摘要，再抽取可复用模块，避免直接抄界面。",
  },
  {
    id: "D",
    title: "先做黑客松 MVP",
    description: "先做可演示最小闭环：输入目标 → 生成 Plan → 输出结果卡片。",
    actionHint: "推荐路径：D1 输入框 → D2 Plan 卡片 → D3 结果卡片 → D4 保存资料包。",
  },
];
type AiAnswerPayload = {
  answer: GeneratedAnswer;
  quality: QualityCheck;
  service: ServiceRecommendation;
};

export function ResultView() {
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [aiTriage, setAiTriage] = useState<AiTriageResponse | null>(null);
  const [aiAnswer, setAiAnswer] = useState<AiAnswerPayload | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  useEffect(() => {
    setResult(loadJson<TriageResponse>(lastResultKey));
    setAiTriage(loadJson<AiTriageResponse>(lastAiTriageKey));
    setAiAnswer(loadJson<AiAnswerPayload>(lastAiAnswerKey));
    setSelectedPath(loadJson<string[]>(lastPlanStateKey) ?? []);
  }, []);

  // Use AI pipeline data if available, otherwise fallback to rule-based result
  const hasAi = !!aiTriage && !!aiAnswer;
  const effectiveResult = hasAi ? null : result;

  if (!effectiveResult && !hasAi) {
    return (
      <section className="panel result-shell empty-state">
        <span className="eyebrow">暂无结果</span>
        <h1>还没有可展示的分诊结果</h1>
        <p>请先完成 intake 表单，再进入结果页查看用户画像、风险和推荐路径。</p>
        <div className="actions">
          <Link className="button button-primary" href="/intake">
            去填写表单
          </Link>
          <Link className="button button-secondary" href="/">
            返回首页
          </Link>
        </div>
      </section>
    );
  }

  const renderPlanWorkspace = () => (
    <>
      <PlanCard
        goal="优化科研课题分诊台首页并形成可展示 MVP"
        recommendation="推荐 D：先做黑客松 MVP，范围最小、最容易展示。"
        options={defaultPlanOptions}
        onSelect={(optionId) => {
          const nextPath = [...selectedPath, optionId].slice(-8);
          setSelectedPath(nextPath);
          saveJson(lastPlanStateKey, nextPath);
        }}
      />

      <article className="panel card-stack">
        <span className="eyebrow">当前 Plan 路径</span>
        <h2>你已经做出的选择</h2>
        {selectedPath.length ? (
          <ol className="step-list">
            {selectedPath.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">还未选择路径。你可以在上方 Plan 卡片中选择 A/B/C/D。</p>
        )}
      </article>
    </>
  );

  // ─── AI Pipeline Result ──────────────────────────────────────
  if (hasAi && aiTriage && aiAnswer) {
    const { triage } = aiTriage;
    const { answer, service } = aiAnswer;
    const profileLabel = userTypeMap[triage.userType] ?? "用户";

    return (
      <section className="result-shell">
        {/* Hero: Diagnosis Basis */}
        <div className="panel result-hero">
          <span className="eyebrow">AI 分诊结果</span>
          <h1>你不是没思路，而是问题还没被拆开</h1>
          <p className="diagnosis-reason">
            <strong>诊断依据：</strong>
            {triage.reason}
          </p>
          <div className="pill-row">
            <span className="pill pill-highlight">类型：{profileLabel}</span>
            <span className="pill">{triage.taskStage}</span>
            <span className="pill">置信度：{Math.round(triage.confidence * 100)}%</span>
            {triage.secondaryType ? (
              <span className="pill pill-dim">次级：{userTypeMap[triage.secondaryType]}</span>
            ) : null}
          </div>
        </div>

        <div className="result-grid">
          {/* Difficulty & Risks */}
          <article className="panel card-stack">
            <span className="eyebrow">难度与风险</span>
            <h2>这些是你最该注意的点</h2>
            <div className="difficulty-badge">难度：{triage.difficulty}</div>
            <ul className="bullet-list">
              {triage.riskList.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
            {answer.riskNotes.length > 0 ? (
              <>
                <h3 style={{ marginTop: "1rem" }}>补充风险提示</h3>
                <ul className="bullet-list">
                  {answer.riskNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>

          {/* Personalized Answer */}
          <article className="panel card-stack card-full">
            <span className="eyebrow">个性化回答 · {profileLabel}专属</span>
            <h2>给你的分诊式回答</h2>
            <div className="answer-text">{answer.answerText}</div>
          </article>

          {/* Next Steps */}
          <article className="panel card-stack">
            <span className="eyebrow">下一步行动</span>
            <h2>按这个顺序做</h2>
            <ol className="step-list">
              {answer.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>

          {/* Downgrade Plan */}
          <article className="panel card-stack">
            <span className="eyebrow">兜底方案</span>
            <h2>如果做不出来，这样降级</h2>
            <p>{answer.downgradePlan}</p>
          </article>

          {/* Teacher Script */}
          <article className="panel card-stack">
            <span className="eyebrow">沟通话术</span>
            <h2>可以这样和老师说</h2>
            <blockquote className="teacher-quote">{answer.teacherScript}</blockquote>
          </article>

          {/* Service Recommendation */}
          <article className="panel card-stack card-full">
            <span className="eyebrow">服务推荐</span>
            <h2>{service.recommendedService}</h2>
            <p>
              <strong>推荐理由：</strong>
              {service.reason}
            </p>
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              <strong>不推荐：</strong>
              {service.notRecommended}
            </p>
            <div className="callout callout-soft" style={{ marginTop: "1rem" }}>
              <strong>下一步行动：</strong> {service.cta}
            </div>
          </article>
        </div>

        {renderPlanWorkspace()}

        <div className="panel cta-strip">
          <div>
            <span className="eyebrow">下一步入口</span>
            <h2>选择适合你的下一步</h2>
          </div>
          <div className="actions wrap-actions">
            <Link className="button button-primary" href="/intake">
              重新诊断
            </Link>
            <Link className="button button-secondary" href="/">
              返回首页
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ─── Rule-Based Fallback Result ──────────────────────────────
  if (!effectiveResult) return null;

  return (
    <section className="result-shell">
      <div className="panel result-hero">
        <span className="eyebrow">分诊结果</span>
        <h1>你不是没思路，而是问题还没被拆开</h1>
        <p>{effectiveResult.plainExplanation}</p>
        {effectiveResult.safetyMode ? (
          <div className="callout callout-danger">
            <strong>已启用合规辅导模式：</strong>
            当前输入涉及学术诚信风险，结果仅提供真实交付、沟通和降级路径建议。
          </div>
        ) : null}
      </div>

      <div className="result-grid">
        <article className="panel card-stack">
          <span className="eyebrow">1. 当前状态</span>
          <h2>你现在处在哪一层</h2>
          <div className="pill-row">
            <span className="pill">{effectiveResult.userProfile}</span>
            <span className="pill">{effectiveResult.currentStage}</span>
            <span className="pill">{effectiveResult.taskCategory}</span>
          </div>
          <p className="muted">
            当前主要卡点已经被归入 <strong>{effectiveResult.taskCategory}</strong>，后续建议会优先围绕这类问题展开。
          </p>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">2. 课题人话解释</span>
          <h2>先理解问题，再决定路线</h2>
          <p>{effectiveResult.plainExplanation}</p>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">3. 难度与风险</span>
          <h2>别先追模型，先看失败点</h2>
          <div className="difficulty-badge">难度：{effectiveResult.difficulty}</div>
          <ul className="bullet-list">
            {effectiveResult.riskList.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">4. 最低可行路径</span>
          <h2>下一步必须具体</h2>
          <ol className="step-list">
            {effectiveResult.minimumPath.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">5. 推荐服务</span>
          <h2>{effectiveResult.recommendedService}</h2>
          <p>{effectiveResult.serviceReason}</p>
        </article>
      </div>

      <div className="panel cta-strip">
        <div>
          <span className="eyebrow">下一步入口</span>
          <h2>选择适合你的下一步</h2>
        </div>

        <div className="actions wrap-actions">
          <Link className="button button-primary" href="/route-plan">
            查看完整项目路线
          </Link>
          <button className="button button-secondary" disabled type="button">
            继续免费问 3 个问题（即将开放）
          </button>
          <Link className="button button-ghost" href="/intake">
            重新填写
          </Link>
        </div>
      </div>

      {renderPlanWorkspace()}
    </section>
  );
}

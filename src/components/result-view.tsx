"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadJson, lastResultKey } from "../lib/storage";
import type { TriageResponse } from "../lib/triage-types";

type EntryMode = "route" | "free" | null;

export function ResultView() {
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>(null);

  useEffect(() => {
    setResult(loadJson<TriageResponse>(lastResultKey));
  }, []);

  if (!result) {
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

  return (
    <section className="result-shell">
      <div className="panel result-hero">
        <span className="eyebrow">分诊结果</span>
        <h1>你不是没思路，而是问题还没被拆开</h1>
        <p>{result.plainExplanation}</p>
        {result.safetyMode ? (
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
            <span className="pill">{result.userProfile}</span>
            <span className="pill">{result.currentStage}</span>
            <span className="pill">{result.taskCategory}</span>
          </div>
          <p className="muted">
            当前主要卡点已经被归入 <strong>{result.taskCategory}</strong>，后续建议会优先围绕这类问题展开。
          </p>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">2. 课题人话解释</span>
          <h2>先理解问题，再决定路线</h2>
          <p>{result.plainExplanation}</p>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">3. 难度与风险</span>
          <h2>别先追模型，先看失败点</h2>
          <div className="difficulty-badge">难度：{result.difficulty}</div>
          <ul className="bullet-list">
            {result.riskList.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">4. 最低可行路径</span>
          <h2>下一步必须具体</h2>
          <ol className="step-list">
            {result.minimumPath.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="panel card-stack">
          <span className="eyebrow">5. 推荐服务</span>
          <h2>{result.recommendedService}</h2>
          <p>{result.serviceReason}</p>
        </article>
      </div>

      <div className="panel cta-strip">
        <div>
          <span className="eyebrow">下一步入口</span>
          <h2>保留商业化入口，但不把 Demo 做重</h2>
        </div>

        <div className="actions wrap-actions">
          <button className="button button-primary" onClick={() => setEntryMode("route")} type="button">
            查看完整项目路线
          </button>
          <button className="button button-secondary" onClick={() => setEntryMode("free")} type="button">
            继续免费问 3 个问题
          </button>
          <Link className="button button-ghost" href="/intake">
            重新填写
          </Link>
        </div>

        {entryMode === "route" ? (
          <p className="entry-note">
            已预留“完整项目路线”入口。黑客松版先停在分诊结果，不展开后续路线生成。
          </p>
        ) : null}

        {entryMode === "free" ? (
          <p className="entry-note">
            已预留“继续免费问”入口。黑客松版先展示入口，不接入多轮对话能力。
          </p>
        ) : null}
      </div>
    </section>
  );
}

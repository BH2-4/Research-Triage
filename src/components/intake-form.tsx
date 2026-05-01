"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";

import { loadJson, lastAiAnswerKey, lastAiTriageKey, lastIntakeKey, saveJson } from "../lib/storage";
import {
  backgroundLevels,
  currentBlockers,
  deadlines,
  defaultIntakeValues,
  goalTypes,
  intakeSchema,
  taskTypes,
  type AiTriageResponse,
  type IntakeRequest,
  type TriageFieldErrors,
} from "../lib/triage-types";

type PendingState = "idle" | "submitting" | "clarifying" | "generating" | "error";

function getIssueMap(input: IntakeRequest): TriageFieldErrors {
  const parsed = intakeSchema.safeParse(input);

  if (parsed.success) {
    return {};
  }

  return parsed.error.issues.reduce<TriageFieldErrors>((acc, issue) => {
    const path = issue.path[0];
    if (typeof path === "string" && !(path in acc)) {
      acc[path as keyof IntakeRequest] = issue.message;
    }
    return acc;
  }, {});
}

export function IntakeForm() {
  const router = useRouter();
  const [form, setForm] = useState<IntakeRequest>(defaultIntakeValues);
  const [errors, setErrors] = useState<TriageFieldErrors>({});
  const [pendingState, setPendingState] = useState<PendingState>("idle");
  const [networkError, setNetworkError] = useState("");
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const triageRef = useRef<AiTriageResponse | null>(null);

  useEffect(() => {
    const savedDraft = loadJson<IntakeRequest>(lastIntakeKey);
    if (savedDraft) {
      setForm(savedDraft);
    }
  }, []);

  const updateField = <K extends keyof IntakeRequest>(key: K, value: IntakeRequest[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updateClarificationAnswer = (index: number, value: string) => {
    setClarificationAnswers((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = getIssueMap(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setPendingState("submitting");
    setNetworkError("");
    saveJson(lastIntakeKey, form);

    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as AiTriageResponse | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "系统暂时没能完成分诊，请稍后再试。";
        throw new Error(message);
      }

      if (!("triage" in payload)) {
        throw new Error("系统返回的数据格式不完整，请稍后再试。");
      }

      triageRef.current = payload;
      saveJson(lastAiTriageKey, payload);

      // If clarification needed, switch to clarifying state
      if (payload.clarification?.needClarification && payload.clarification.questions.length > 0) {
        setClarificationQuestions(payload.clarification.questions);
        setClarificationAnswers(new Array(payload.clarification.questions.length).fill(""));
        setPendingState("clarifying");
        return;
      }

      // No clarification needed → proceed to generate answer
      await runGenerateAnswer(payload);
    } catch (error) {
      setPendingState("error");
      setNetworkError(
        error instanceof Error ? error.message : "系统暂时没能完成分诊，请稍后再试。",
      );
    }
  };

  const handleClarifySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const triage = triageRef.current;
    if (!triage) return;

    // Check at least one answer is non-empty
    const hasAnswer = clarificationAnswers.some((a) => a.trim().length > 0);
    if (!hasAnswer) return;

    setPendingState("generating");
    setNetworkError("");

    // Re-run triage with answers appended to topic
    try {
      const answersText = clarificationAnswers
        .map((a, i) => `Q: ${clarificationQuestions[i]}\nA: ${a}`)
        .join("\n\n");
      const updatedForm = { ...form, topicText: `${form.topicText}\n\n[追问回答]\n${answersText}` };

      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });

      const payload = (await response.json()) as AiTriageResponse | { error?: string };

      if (!response.ok || !("triage" in payload)) {
        throw new Error("error" in payload ? String(payload.error) : "分诊失败");
      }

      triageRef.current = payload;
      saveJson(lastAiTriageKey, payload);
      await runGenerateAnswer(payload);
    } catch (error) {
      setPendingState("error");
      setNetworkError(
        error instanceof Error ? error.message : "系统暂时没能生成回答，请稍后再试。",
      );
    }
  };

  const runGenerateAnswer = async (triage: AiTriageResponse) => {
    setPendingState("generating");

    try {
      const response = await fetch("/api/generate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalized: triage.normalized,
          triage: triage.triage,
          route: triage.route,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "回答生成失败",
        );
      }

      saveJson(lastAiAnswerKey, payload);
      startTransition(() => {
        router.push("/result");
      });
    } catch (error) {
      setPendingState("error");
      setNetworkError(
        error instanceof Error ? error.message : "系统暂时没能生成回答，请稍后再试。",
      );
    }
  };

  const isLoading = pendingState === "submitting" || pendingState === "generating";

  return (
    <>
      {isLoading ? (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-panel">
            <span className="eyebrow">
              {pendingState === "submitting" ? "正在分析" : "正在生成回答"}
            </span>
            <h2>
              {pendingState === "submitting"
                ? "正在理解你的课题状态"
                : "正在为你生成个性化回答"}
            </h2>
            {pendingState === "submitting" ? (
              <ul className="loading-steps" aria-label="分析步骤">
                <li>正在理解课题…</li>
                <li>正在判断你的基础…</li>
                <li>正在识别当前卡点…</li>
                <li>正在评估风险…</li>
                <li>正在选择回答方式…</li>
              </ul>
            ) : (
              <p>根据你的用户类型、任务阶段和风险等级，生成最适合你的回答。</p>
            )}
          </div>
        </div>
      ) : null}

      {pendingState === "clarifying" ? (
        <form className="panel form-shell" onSubmit={handleClarifySubmit} noValidate>
          <div className="section-heading">
            <span className="eyebrow">补充信息</span>
            <h1>再确认几个关键问题，让回答更准</h1>
            <p>
              系统需要多了解一些信息，才能给出更精准的判断和路线。请尽可能回答以下问题。
            </p>
          </div>

          {clarificationQuestions.map((question, i) => (
            <Field
              key={i}
              label={`${i + 1}. ${question}`}
              control={
                <textarea
                  value={clarificationAnswers[i] ?? ""}
                  onChange={(e) => updateClarificationAnswer(i, e.target.value)}
                  rows={2}
                  placeholder="输入你的回答…"
                />
              }
            />
          ))}

          <div className="actions">
            <button className="button button-primary" type="submit">
              提交并生成回答
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={async () => {
                if (triageRef.current) {
                  setPendingState("generating");
                  await runGenerateAnswer(triageRef.current);
                }
              }}
            >
              跳过，直接生成
            </button>
          </div>
        </form>
      ) : (
        <form className="panel form-shell" onSubmit={handleSubmit} noValidate>
        <div className="section-heading">
          <span className="eyebrow">第一步</span>
          <h1>先把课题说清楚，再决定怎么做</h1>
          <p>
            这不是空白聊天框。你先给出任务类型、卡点、基础和截止时间，系统再给分诊结果。
          </p>
        </div>

        <div className="callout callout-soft">
          <strong>文本优先：</strong>
          可直接粘贴截图文字、摘要或任务描述。附件解析入口先保留到后续版本，这一轮不做文件上传。
        </div>

        <div className="form-grid">
          <Field
            label="你的任务类型"
            error={errors.taskType}
            control={
              <select
                value={form.taskType}
                onChange={(event) => updateField("taskType", event.target.value as IntakeRequest["taskType"])}
              >
                {taskTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            label="你现在最卡在哪里"
            error={errors.currentBlocker}
            control={
              <select
                value={form.currentBlocker}
                onChange={(event) =>
                  updateField("currentBlocker", event.target.value as IntakeRequest["currentBlocker"])
                }
              >
                {currentBlockers.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            label="你的基础如何"
            error={errors.backgroundLevel}
            control={
              <select
                value={form.backgroundLevel}
                onChange={(event) =>
                  updateField("backgroundLevel", event.target.value as IntakeRequest["backgroundLevel"])
                }
              >
                {backgroundLevels.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            label="你的截止时间"
            error={errors.deadline}
            control={
              <select
                value={form.deadline}
                onChange={(event) => updateField("deadline", event.target.value as IntakeRequest["deadline"])}
              >
                {deadlines.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            label="你现在最想达到什么目标"
            error={errors.goalType}
            control={
              <select
                value={form.goalType}
                onChange={(event) => updateField("goalType", event.target.value as IntakeRequest["goalType"])}
              >
                {goalTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            }
          />
        </div>

        <Field
          label="粘贴你的课题、老师要求或已有想法"
          error={errors.topicText}
          control={
            <>
              <textarea
                value={form.topicText}
                onChange={(event) => updateField("topicText", event.target.value)}
                rows={9}
                placeholder="例如：导师让我做一个 AI for Science 相关课程项目，但我目前只知道方向和截止时间，不清楚研究对象、数据来源和最低交付物。"
              />
              <div className="field-meta">
                <span>建议至少包含：课题标题、老师要求、你现在会什么、你最担心什么。</span>
                <span>{form.topicText.trim().length} / 2000</span>
              </div>
            </>
          }
        />

        <div className="callout callout-danger">
          <strong>安全边界：</strong>
          不支持代写、伪造数据、伪造实验或规避学术审查。命中这类内容时，系统会切换为合规辅导模式。
        </div>

        {networkError ? <p className="error-banner">{networkError}</p> : null}

        <div className="actions">
          <button className="button button-primary" type="submit">
            立即诊断课题
          </button>
          <Link className="button button-secondary" href="/">
            返回首页
          </Link>
        </div>
      </form>
      )}
    </>
  );
}

function Field({
  label,
  control,
  error,
}: {
  label: string;
  control: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {control}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { loadJson, lastIntakeKey, lastResultKey, saveJson } from "../lib/storage";
import {
  backgroundLevels,
  currentBlockers,
  deadlines,
  defaultIntakeValues,
  goalTypes,
  intakeSchema,
  taskTypes,
  type IntakeRequest,
  type TriageFieldErrors,
  type TriageResponse,
} from "../lib/triage-types";

type PendingState = "idle" | "submitting" | "error";

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
      const response = await fetch("/api/triage/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as TriageResponse | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "系统暂时没能完成分诊，请稍后再试。";
        throw new Error(message);
      }

      if (!("userProfile" in payload)) {
        throw new Error("系统返回的数据格式不完整，请稍后再试。");
      }

      saveJson(lastResultKey, payload);
      startTransition(() => {
        router.push("/result");
      });
    } catch (error) {
      setPendingState("error");
      setNetworkError(
        error instanceof Error ? error.message : "系统暂时没能完成分诊，请稍后再试。",
      );
    }
  };

  return (
    <>
      {pendingState === "submitting" ? (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-panel">
            <span className="eyebrow">正在分诊</span>
            <h2>正在整理你的课题状态</h2>
            <p>系统会先判断你是谁、卡在哪里，再生成第一步和推荐路径。</p>
          </div>
        </div>
      ) : null}

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

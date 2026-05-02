"use client";

import { useEffect, useMemo, useState } from "react";
import type { FileManifest } from "../lib/triage-types";

type Props = {
  sessionId: string;
  files: FileManifest[];
  onFileSelect: (filename: string) => void;
};

type PlanDoc = {
  filename: string;
  title: string;
  content: string;
  version: number;
};

function extractSection(content: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`## ${escaped}\\n+([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() ?? "";
}

function firstChangedSection(left: PlanDoc, right: PlanDoc): string {
  const sections = ["用户画像", "问题判断", "系统逻辑", "推荐路径", "步骤", "风险", "下一步选项"];
  for (const section of sections) {
    if (extractSection(left.content, section) !== extractSection(right.content, section)) {
      return section;
    }
  }
  return "内容";
}

export function PlanHistoryPanel({ sessionId, files, onFileSelect }: Props) {
  const planFiles = useMemo(
    () => files
      .filter((f) => f.type === "plan")
      .sort((a, b) => b.version - a.version),
    [files],
  );

  const [leftName, setLeftName] = useState("");
  const [rightName, setRightName] = useState("");
  const [leftDoc, setLeftDoc] = useState<PlanDoc | null>(null);
  const [rightDoc, setRightDoc] = useState<PlanDoc | null>(null);

  useEffect(() => {
    if (planFiles.length === 0) {
      setLeftName("");
      setRightName("");
      return;
    }
    setLeftName((current) => current || planFiles[1]?.filename || planFiles[0].filename);
    setRightName((current) => current || planFiles[0].filename);
  }, [planFiles]);

  useEffect(() => {
    let cancelled = false;

    async function load(filename: string, setter: (doc: PlanDoc | null) => void) {
      if (!filename || !sessionId) {
        setter(null);
        return;
      }
      try {
        const resp = await fetch(`/api/userspace/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setter(data);
      } catch {
        if (!cancelled) setter(null);
      }
    }

    load(leftName, setLeftDoc);
    load(rightName, setRightDoc);

    return () => {
      cancelled = true;
    };
  }, [leftName, rightName, sessionId]);

  if (planFiles.length < 2) {
    return null;
  }

  const changed = leftDoc && rightDoc ? firstChangedSection(leftDoc, rightDoc) : "";

  return (
    <div className="panel plan-history-panel">
      <span className="eyebrow">Plan 历史对比</span>
      <div className="plan-history-controls">
        <select value={leftName} onChange={(e) => setLeftName(e.target.value)}>
          {planFiles.map((file) => (
            <option key={file.filename} value={file.filename}>
              v{file.version}
            </option>
          ))}
        </select>
        <span className="plan-history-arrow">→</span>
        <select value={rightName} onChange={(e) => setRightName(e.target.value)}>
          {planFiles.map((file) => (
            <option key={file.filename} value={file.filename}>
              v{file.version}
            </option>
          ))}
        </select>
      </div>

      <div className="plan-history-summary">
        {changed ? `主要变化：${changed}` : "选择两个版本查看差异。"}
      </div>

      <div className="plan-history-actions">
        <button type="button" onClick={() => leftName && onFileSelect(leftName)}>
          打开左版
        </button>
        <button type="button" onClick={() => rightName && onFileSelect(rightName)}>
          打开右版
        </button>
      </div>
    </div>
  );
}

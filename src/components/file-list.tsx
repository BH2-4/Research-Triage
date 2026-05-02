"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileManifest } from "../lib/triage-types";

type Props = {
  sessionId: string;
  onFileSelect: (filename: string) => void;
  refreshTrigger?: number; // increment to force refresh
  onFilesChange?: (files: FileManifest[]) => void;
};

const typeIcons: Record<string, string> = {
  profile: "👤",
  plan: "📋",
  checklist: "✅",
  path: "🗺",
  summary: "📄",
  image: "🖼",
  code: "💻",
};

export function FileList({ sessionId, onFileSelect, refreshTrigger, onFilesChange }: Props) {
  const [files, setFiles] = useState<FileManifest[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/userspace/${encodeURIComponent(sessionId)}`);
      if (resp.ok) {
        const data = await resp.json();
        const nextFiles = data.files ?? [];
        setFiles(nextFiles);
        onFilesChange?.(nextFiles);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [sessionId, onFilesChange]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshTrigger]);

  if (files.length === 0) {
    return (
      <div className="panel" style={{ marginTop: "1rem" }}>
        <span className="eyebrow">文件列表</span>
        <p className="muted">{loading ? "加载中…" : "AI 生成的文档将出现在这里。"}</p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: "1rem" }}>
      <span className="eyebrow">文件列表</span>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.filename} className="file-item">
            <button
              className="file-item-btn"
              type="button"
              onClick={() => onFileSelect(f.filename)}
            >
              <span className="file-icon">{typeIcons[f.type] ?? "📄"}</span>
              <span className="file-name">{f.title}</span>
              {f.type === "plan" && <span className="file-version">v{f.version}</span>}
              {f.type === "code" && <span className="file-version">{f.language ?? "code"}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";

type DocData = {
  filename: string;
  title: string;
  content: string;
  type?: string;
  language?: string;
  createdAt: string;
};

type Props = {
  sessionId: string;
  activeFile: string | null;
  onClose: () => void;
};

export function DocPanel({ sessionId, activeFile, onClose }: Props) {
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!activeFile || !sessionId) {
      setDoc(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setOpening(false);

    fetch(`/api/userspace/${encodeURIComponent(sessionId)}/${encodeURIComponent(activeFile)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: DocData) => {
        if (!cancelled) setDoc(data);
      })
      .catch(() => {
        if (!cancelled) setDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeFile, sessionId]);

  if (!activeFile) {
    return (
      <div className="panel doc-panel" style={{ marginTop: "1rem" }}>
        <span className="eyebrow">文档预览</span>
        <p className="muted">点击文件列表中的文件查看内容。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="panel doc-panel" style={{ marginTop: "1rem" }}>
        <span className="eyebrow">文档预览</span>
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="panel doc-panel" style={{ marginTop: "1rem" }}>
        <span className="eyebrow">文档预览</span>
        <p className="muted">暂无可预览文档。</p>
      </div>
    );
  }

  const encodedSession = encodeURIComponent(sessionId);
  const encodedFile = encodeURIComponent(doc.filename);
  const fileUrl = `/api/userspace/${encodedSession}/${encodedFile}`;
  const rawUrl = `${fileUrl}?raw=1`;
  const isCode = doc.type === "code";

  async function openWithSystemDefault() {
    setOpening(true);
    try {
      const resp = await fetch(`${fileUrl}?action=open`, { method: "POST" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch {
      window.alert("系统打开失败，请使用“打开”或“下载”。");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="panel doc-panel" style={{ marginTop: "1rem" }}>
      <div className="doc-header">
        <span className="eyebrow">文档预览</span>
        <div className="doc-actions">
          <button
            className="doc-action-link doc-action-button"
            type="button"
            onClick={openWithSystemDefault}
            disabled={opening}
            title="用系统默认应用打开"
          >
            {opening ? "打开中" : "系统打开"}
          </button>
          <a className="doc-action-link" href={rawUrl} target="_blank" rel="noreferrer">
            打开
          </a>
          <a className="doc-action-link" href={rawUrl} download={doc.filename}>
            下载
          </a>
          <button className="doc-close-btn" type="button" onClick={onClose}>✕</button>
        </div>
      </div>
      <h3 className="doc-title">{doc.title}</h3>
      {isCode && doc.language && <span className="doc-code-lang">{doc.language}</span>}
      <time className="doc-time">{new Date(doc.createdAt).toLocaleString("zh-CN")}</time>
      {isCode ? (
        <pre className="doc-code-block"><code>{doc.content}</code></pre>
      ) : (
        <div
          className="doc-body plan-md"
          dangerouslySetInnerHTML={{ __html: marked.parse(doc.content) }}
        />
      )}
    </div>
  );
}

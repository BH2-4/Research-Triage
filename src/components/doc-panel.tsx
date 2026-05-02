"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";

type DocData = {
  filename: string;
  title: string;
  content: string;
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

  useEffect(() => {
    if (!activeFile || !sessionId) {
      setDoc(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

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
        <p className="muted">文件加载失败。</p>
      </div>
    );
  }

  return (
    <div className="panel doc-panel" style={{ marginTop: "1rem" }}>
      <div className="doc-header">
        <span className="eyebrow">文档预览</span>
        <button className="doc-close-btn" type="button" onClick={onClose}>✕</button>
      </div>
      <h3 className="doc-title">{doc.title}</h3>
      <time className="doc-time">{new Date(doc.createdAt).toLocaleString("zh-CN")}</time>
      <div
        className="doc-body plan-md"
        dangerouslySetInnerHTML={{ __html: marked.parse(doc.content) }}
      />
    </div>
  );
}

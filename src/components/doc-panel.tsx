"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownBlock } from "./markdown-block";

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
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!activeFile || !sessionId) {
      setDoc(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setOpening(false);
    setImageFailed(false);

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

  const isCode = doc?.type === "code";
  const isImage = doc?.type === "image";
  const imageMeta = useMemo(() => {
    if (!isImage || !doc) return null;
    try {
      return JSON.parse(doc.content) as {
        title?: string;
        url?: string;
        source?: string;
        caption?: string;
        alt?: string;
      };
    } catch {
      return null;
    }
  }, [doc, isImage]);

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
      {isImage && imageMeta?.url ? (
        <div className="doc-image-preview">
          {imageFailed ? (
            <span className="markdown-image-error">图片加载失败</span>
          ) : (
            <img
              src={imageMeta.url}
              alt={imageMeta.alt ?? imageMeta.title ?? doc.title}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          )}
          {(imageMeta.caption || imageMeta.source) && (
            <p className="markdown-image-caption">
              {[imageMeta.caption, imageMeta.source].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      ) : isCode ? (
        <pre className="doc-code-block"><code>{doc.content}</code></pre>
      ) : (
        <MarkdownBlock className="doc-body plan-md" content={doc.content} />
      )}
    </div>
  );
}

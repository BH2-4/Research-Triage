"use client";

import { useEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";

type Props = {
  content: string;
  className: string;
};

export function MarkdownBlock({ content, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    const images = root.querySelectorAll<HTMLImageElement>("img[data-markdown-image='true']");

    images.forEach((img) => {
      const showFallback = () => {
        if (img.dataset.failed === "true") return;
        img.dataset.failed = "true";
        img.hidden = true;
        const fallback = document.createElement("span");
        fallback.className = "markdown-image-error";
        fallback.textContent = "图片加载失败";
        img.insertAdjacentElement("afterend", fallback);
      };

      img.addEventListener("error", showFallback);
      cleanups.push(() => img.removeEventListener("error", showFallback));
      if (img.complete && img.naturalWidth === 0) showFallback();
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}


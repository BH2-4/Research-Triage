"use client";

import { useState } from "react";
import { marked } from "marked";

type Props = {
  process: string;
};

export function ProcessPanel({ process }: Props) {
  const [open, setOpen] = useState(false);

  if (!process) return null;

  return (
    <div className="process-panel">
      <button
        className="process-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="process-icon">{open ? "▼" : "▶"}</span>
        思考流程
      </button>
      {open && (
        <div
          className="process-content"
          dangerouslySetInnerHTML={{ __html: marked.parse(process) }}
        />
      )}
    </div>
  );
}

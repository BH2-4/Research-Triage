"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { ChoiceButtons } from "./choice-buttons";
import { ProcessPanel } from "./process-panel";
import type { ChatMessage } from "../lib/triage-types";

type Props = {
  messages: ChatMessage[];
  onSelect: (text: string) => void;
  loading?: boolean;
};

/**
 * Inline "custom input" row — always rendered below each assistant
 * message that has questions, so the user can type a free-form reply
 * even when none of the buttons fit.
 */
function InlineInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="chat-inline-input">
      <input
        type="text"
        placeholder="选项都不合适？直接写你的想法…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        disabled={disabled}
      />
      <button type="button" onClick={handleSubmit} disabled={disabled || !value.trim()}>
        发送
      </button>
    </div>
  );
}

export function ChatPanel({ messages, onSelect, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <h2>欢迎来到「人人都能做科研」</h2>
            <p>
              告诉我你对什么感兴趣，或者你想研究什么。
              <br />
              我会先了解你的情况，再帮你找到最适合你的科研探索路径。
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
              {m.role === "assistant" && m.process && (
                <ProcessPanel process={m.process} />
              )}
              <div
                className="chat-bubble-text"
                dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }}
              />
              {m.role === "assistant" && m.questions && m.questions.length > 0 && (
                <>
                  <ChoiceButtons
                    questions={m.questions}
                    onSelect={onSelect}
                    disabled={loading}
                  />
                  <InlineInput onSend={onSelect} disabled={loading} />
                </>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="chat-bubble chat-bubble--assistant">
            <div className="chat-bubble-text chat-typing">思考中…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

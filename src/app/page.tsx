"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatInput } from "../components/chat-input";
import { ChatPanel } from "../components/chat-panel";
import { SidePanel } from "../components/side-panel";
import type { ChatMessage, PlanState, UserProfileState } from "../lib/triage-types";

const SESSION_KEY = "triage:chat-session";
const SESSION_ID_KEY = "triage:session-id";

type SavedSession = {
  messages: ChatMessage[];
  profile: UserProfileState | null;
  profileConfidence: Record<string, number>;
  plan: PlanState | null;
  sessionId: string;
};

function getSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const saved = sessionStorage.getItem(SESSION_ID_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_ID_KEY, id);
  return id;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<UserProfileState | null>(null);
  const [profileConfidence, setProfileConfidence] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileRefresh, setFileRefresh] = useState(0);
  const [history, setHistory] = useState<
    { messages: ChatMessage[]; profile: UserProfileState | null; profileConfidence: Record<string, number>; plan: PlanState | null }[]
  >([]);

  // Hydration guard: only restore from sessionStorage on client
  useEffect(() => {
    const id = getSessionId();
    setSessionId(id);

    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as SavedSession;
        if (saved.sessionId === id) {
          setMessages(saved.messages);
          setProfile(saved.profile);
          setProfileConfidence(saved.profileConfidence ?? {});
          setPlan(saved.plan ?? null);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Save session after every change
  useEffect(() => {
    if (!sessionId) return;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ messages, profile, profileConfidence, plan, sessionId }),
    );
  }, [messages, profile, profileConfidence, plan, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || loading) return;

      // Save snapshot before this turn
      setHistory((prev) => [...prev, { messages: [...messages], profile, profileConfidence, plan }]);

      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId }),
        });

        const data = await resp.json();

        if (!resp.ok) {
          const errMsg: ChatMessage = {
            role: "assistant",
            content: `出错了：${data.error ?? "未知错误"}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errMsg]);
          return;
        }

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.reply,
          questions: data.questions,
          process: data.process,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        let shouldRefreshFiles = false;

        if (data.profile) {
          setProfile(data.profile);
          shouldRefreshFiles = true;
        }
        if (data.profileConfidence) {
          setProfileConfidence(data.profileConfidence);
        }
        if (data.plan) {
          setPlan(data.plan);
          shouldRefreshFiles = true;
        }
        if (shouldRefreshFiles) {
          setFileRefresh((n) => n + 1);
        }
      } catch (err) {
        const errMsg: ChatMessage = {
          role: "assistant",
          content: `网络异常：${err instanceof Error ? err.message : "请检查连接"}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, loading, messages, profile, profileConfidence, plan],
  );

  const handleSelect = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleReset = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_ID_KEY);
    setMessages([]);
    setProfile(null);
    setProfileConfidence({});
    setPlan(null);
    setHistory([]);
    setSessionId("");
    setTimeout(() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_ID_KEY, id);
      setSessionId(id);
    }, 0);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setMessages(restored.messages);
      setProfile(restored.profile);
      setProfileConfidence(restored.profileConfidence ?? {});
      setPlan(restored.plan);
      return prev.slice(0, -1);
    });
  }, []);

  return (
    <div className="chat-layout">
      <div className="chat-main">
        <div className="chat-header">
          <span className="chat-title">人人都能做科研</span>
          <div className="chat-header-actions">
            <button
              className="button-undo"
              type="button"
              onClick={handleUndo}
              disabled={loading || history.length === 0}
              suppressHydrationWarning
              title="撤销上一轮对话"
            >
              撤销
            </button>
            <button
              className="button-reset"
              type="button"
              onClick={handleReset}
              disabled={loading}
              title="开始新话题"
            >
              新对话
            </button>
          </div>
        </div>
        <ChatPanel messages={messages} onSelect={handleSelect} loading={loading} />
        <ChatInput onSend={sendMessage} disabled={loading} />
      </div>
      <SidePanel
        profile={profile}
        profileConfidence={profileConfidence}
        plan={plan}
        sessionId={sessionId}
        fileRefresh={fileRefresh}
        onPlanAction={handleSelect}
        disabled={loading}
      />
    </div>
  );
}

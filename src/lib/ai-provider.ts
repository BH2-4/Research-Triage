/**
 * Generic OpenAI-compatible chat client via bare fetch.
 *
 * Works with any provider exposing the OpenAI /chat/completions spec:
 *   - DeepSeek, OpenAI, Moonshot, Zhipu GLM, OpenRouter, local vLLM/ollama, etc.
 *
 * Switch providers by editing .env only — no code changes required.
 *
 * Env vars (in precedence order):
 *   AI_BASE_URL       — e.g. https://api.deepseek.com/v1
 *   AI_API_KEY        — bearer token
 *   AI_MODEL          — model id (e.g. deepseek-v4-flash, gpt-4o-mini)
 *
 * Legacy fallbacks (kept for backward compat):
 *   DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY
 *   OPENAI_BASE_URL   / OPENAI_API_KEY
 */

const BASE =
  process.env.AI_BASE_URL ||
  process.env.DEEPSEEK_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  "https://api.deepseek.com/v1";

const API_KEY =
  process.env.AI_API_KEY ||
  process.env.DEEPSEEK_API_KEY ||
  process.env.OPENAI_API_KEY ||
  "";

export const DEFAULT_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMsg = { role: ChatRole; content: string };

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  traceLabel?: string;
  /** Single-turn convenience: prompt + optional system. */
  prompt?: string;
  system?: string;
  /** Multi-turn: full messages array (takes precedence over prompt/system). */
  messages?: ChatMsg[];
}

export interface ChatResult {
  content: string;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  if (!API_KEY) {
    throw new Error(
      "No API key found. Set AI_API_KEY in .env (or DEEPSEEK_API_KEY / OPENAI_API_KEY).",
    );
  }

  const messages: ChatMsg[] =
    opts.messages ??
    [
      ...(opts.system ? [{ role: "system" as ChatRole, content: opts.system }] : []),
      { role: "user" as ChatRole, content: opts.prompt ?? "" },
    ];

  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.3,
    messages,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const url = `${BASE.replace(/\/$/, "")}/chat/completions`;
  const traceLabel = opts.traceLabel ? ` ${opts.traceLabel}` : "";
  const startedAt = Date.now();
  console.log(
    `[chat] start${traceLabel} model=${body.model} msgs=${messages.length} maxTokens=${body.max_tokens ?? "-"} key=${API_KEY ? "yes" : "missing"}`,
  );

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.warn(
      `[chat] failed${traceLabel} status=${resp.status} latencyMs=${Date.now() - startedAt}`,
    );
    throw new Error(
      `API ${resp.status} ${resp.statusText}: ${errText.slice(0, 300)}`,
    );
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const msg = json.choices?.[0]?.message;
  const content = msg?.content;
  if (!content) {
    throw new Error(
      `API returned empty content. Raw: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }

  console.log(
    `[chat] success${traceLabel} latencyMs=${Date.now() - startedAt} contentChars=${content.length}`,
  );

  return { content };
}

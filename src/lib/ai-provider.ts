/**
 * Raw OpenAI-compatible chat completion via fetch.
 * Bypasses @ai-sdk/openai entirely to avoid compatibility issues.
 */
const BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const API_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

export const DEFAULT_MODEL = "deepseek-v4-flash" as const;
export const PRO_MODEL = "deepseek-v4-pro" as const;

interface ChatOptions {
  model?: string;
  temperature?: number;
  system?: string;
  prompt: string;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.3,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: opts.prompt },
    ] as Array<{ role: string; content: string }>,
  };

  const url = `${BASE}/chat/completions`;
  console.log("[chat] POST", url, "model:", body.model);

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
    throw new Error(`API ${resp.status} ${resp.statusText}: ${errText.slice(0, 300)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`API返回无内容。原始响应: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return content;
}

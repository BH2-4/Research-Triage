async function main() {
  const baseURL =
    process.env.AI_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.deepseek.com/v1";
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "deepseek-v4-flash";

  console.log("API base:", baseURL);
  console.log("API model:", model);
  console.log("API key:", apiKey ? `set (length=${apiKey.length})` : "missing");

  if (!apiKey) {
    throw new Error("Set AI_API_KEY, DEEPSEEK_API_KEY, or OPENAI_API_KEY first.");
  }

  try {
    const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: "回复一个词：成功" }],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const json = JSON.parse(text);
    console.log("success:", json.choices?.[0]?.message?.content ?? text);
  } catch (err) {
    console.error("failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();

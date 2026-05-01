/**
 * Standalone test: verify DeepSeek API connectivity via @ai-sdk/openai.
 * Run with: npx tsx --env-file=.env scripts/test-deepseek.ts
 */
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
});

async function main() {
  console.log("🔧 测试 DeepSeek 连接...");
  console.log("   baseURL:", process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1");
  console.log("   apiKey 已设置:", !!process.env.DEEPSEEK_API_KEY || !!process.env.OPENAI_API_KEY);

  try {
    const { text } = await generateText({
      model: deepseek("deepseek-chat"),
      prompt: "用一句话回答：什么是科研课题分诊？",
      temperature: 0,
    });
    console.log("✅ DeepSeek 连接成功！");
    console.log("   回复:", text);
  } catch (err) {
    console.error("❌ DeepSeek 连接失败:", err);
  }
}

main();

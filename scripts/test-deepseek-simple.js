const { createOpenAI } = require("@ai-sdk/openai");
const { generateText } = require("ai");

async function main() {
  const deepseek = createOpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
  });

  console.log("🔧 API key:", process.env.DEEPSEEK_API_KEY ? "已设置 (长度=" + process.env.DEEPSEEK_API_KEY.length + ")" : "未设置!!");

  try {
    const { text } = await generateText({
      model: deepseek("deepseek-chat"),
      prompt: "回复一个词：成功",
      temperature: 0,
    });
    console.log("✅ 成功:", text);
  } catch (err) {
    console.error("❌ 失败:");
    console.error("   消息:", err.message);
    console.error("   原因:", err.cause);
    console.error("   statusCode:", err.statusCode);
    if (err.responseBody) console.error("   响应体:", err.responseBody);
  }
}

main();

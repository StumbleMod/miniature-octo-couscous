import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from "express";
import { init } from "@heyputer/puter.js/src/init.cjs";
import { pickModel } from "./router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fix dotenv17 — citim .env manual fara dotenv
try {
  const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.substring(0, i).trim();
    const v = t.substring(i + 1).trim();
    if (k && v && !process.env[k]) process.env[k] = v;
  }
  console.log('[env] .env incarcat manual — PUTER_AUTH_TOKEN:', !!process.env.PUTER_AUTH_TOKEN);
} catch(e) {
  console.warn('[env] .env nu a fost gasit:', e.message);
}

const puter = init(process.env.PUTER_AUTH_TOKEN);
console.log("Puter initialized, auth:", !!process.env.PUTER_AUTH_TOKEN);

const PORT = parseInt(process.env.PORT) || 3333;
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function extractContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(c => c.text || c).join("");
  return "";
}

app.post("/v1/chat/completions", async (req, res) => {
  try {
    let { messages, model, stream } = req.body;
    if (!model || model === "auto" || model === "Auto") model = pickModel(messages);
    if (!messages || !Array.isArray(messages)) messages = [{ role: "user", content: "" }];

    const response = await puter.ai.chat(messages, { model, stream: false });
    const contentText = extractContent(response.message?.content);

    res.json({
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: Date.now(),
      model,
      choices: [{ index: 0, message: { role: "assistant", content: contentText }, finish_reason: "stop" }],
      usage: response.usage || {}
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message, type: "internal_error" });
  }
});

app.post("/v1/messages", async (req, res) => {
  try {
    let { messages, model, max_tokens, system, prompt } = req.body;
    if (!model || model === "auto" || model === "Auto") model = "claude-opus-4-5-latest";

    let allMessages = [];
    if (system) allMessages.push({ role: "system", content: system });
    if (messages && Array.isArray(messages)) allMessages.push(...messages);
    else if (prompt) allMessages.push({ role: "user", content: prompt });
    if (allMessages.length === 0) allMessages.push({ role: "user", content: "" });

    const response = await puter.ai.chat(allMessages, { model, stream: false, max_tokens: max_tokens || 4096 });
    const contentText = extractContent(response.message?.content);

    res.json({
      id: response.message?.id || "msg_" + Date.now(),
      type: "message",
      role: "assistant",
      content: contentText ? [{ type: "text", text: contentText }] : [],
      model,
      stop_reason: response.message?.stop_reason || "end_turn",
      usage: response.usage || { input_tokens: 0, output_tokens: 0 }
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message, type: "error" });
  }
});

app.post("/chat", async (req, res) => {
  try {
    let { messages, model } = req.body;
    if (!model || model === "auto" || model === "Auto") model = pickModel(messages);
    if (!messages || !Array.isArray(messages)) messages = [{ role: "user", content: "" }];

    const response = await puter.ai.chat(messages, { model, stream: false });
    res.json(response);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Puter proxy server running on http://localhost:${PORT}`);
  console.log("Available routes:");
  console.log("  POST /chat - Chat with AI (auto-routing)");
  console.log("  POST /v1/chat/completions - OpenAI-compatible API");
  console.log("  POST /v1/messages - Anthropic-compatible API");
});

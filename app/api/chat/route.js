// Provider-agnostic chat endpoint with automatic failover.
// Configure any combination of ANTHROPIC_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY.
// AI_PROVIDER (optional) picks which one to try FIRST — if it's slow or errors,
// the request automatically retries with the next configured provider, silently,
// so the user never sees an intermediate failure. Only if every configured
// provider fails does the user see an error.
//
// Whichever provider ultimately answers, this route always returns the same
// shape to the frontend: { content: [{ type: "text", text: "..." }] }.

export const maxDuration = 60;
const PER_PROVIDER_TIMEOUT_MS = 18000;

function toGeminiContents(messages) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") return { role, parts: [{ text: m.content }] };
    const parts = (m.content || []).map((block) =>
      block.type === "image"
        ? { inline_data: { mime_type: block.source.media_type, data: block.source.data } }
        : { text: block.text || "" }
    );
    return { role, parts };
  });
}

function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const content = (m.content || []).map((block) =>
      block.type === "image"
        ? { type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }
        : { type: "text", text: block.text || "" }
    );
    return { role: m.role, content };
  });
}

async function callAnthropic({ system, messages, tools }, signal) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("no ANTHROPIC_API_KEY configured");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1500,
      system,
      messages,
      tools: tools || undefined,
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) throw new Error(`Anthropic ${upstream.status}: ${data?.error?.message || "unknown error"}`);
  return data;
}

async function callGemini({ system, messages }, signal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("no GEMINI_API_KEY configured");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      tools: [{ google_search: {} }],
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) throw new Error(`Gemini ${upstream.status}: ${data?.error?.message || "unknown error"}`);
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return { content: [{ type: "text", text }] };
}

async function callNvidia({ system, messages }, signal) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("no NVIDIA_API_KEY configured");

  const model = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";
  const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "system", content: system }, ...toOpenAIMessages(messages)],
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok) throw new Error(`NVIDIA ${upstream.status}: ${data?.error?.message || "unknown error"}`);
  const text = data?.choices?.[0]?.message?.content || "";
  return { content: [{ type: "text", text }] };
}

const CALLERS = { anthropic: callAnthropic, gemini: callGemini, nvidia: callNvidia };

// Fastest/most capable first by default; whatever AI_PROVIDER is set to jumps
// to the front of the line, but everything configured is still a fallback.
function buildProviderOrder() {
  const configured = ["gemini", "anthropic", "nvidia"].filter((p) => {
    if (p === "gemini") return !!process.env.GEMINI_API_KEY;
    if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
    if (p === "nvidia") return !!process.env.NVIDIA_API_KEY;
    return false;
  });
  const preferred = process.env.AI_PROVIDER?.toLowerCase();
  if (preferred && configured.includes(preferred)) {
    return [preferred, ...configured.filter((p) => p !== preferred)];
  }
  return configured.length ? configured : ["anthropic"];
}

async function withTimeout(fn, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const order = buildProviderOrder();
  const failures = [];

  for (const provider of order) {
    try {
      const data = await withTimeout((signal) => CALLERS[provider](body, signal), PER_PROVIDER_TIMEOUT_MS);
      return Response.json(data, { status: 200 });
    } catch (e) {
      const reason = e.name === "AbortError" ? `${provider} timed out after ${PER_PROVIDER_TIMEOUT_MS / 1000}s` : `${provider}: ${e.message}`;
      console.error("Provider attempt failed, trying next:", reason);
      failures.push(reason);
    }
  }

  return Response.json(
    { error: `All configured providers failed. Details: ${failures.join(" | ")}` },
    { status: 502 }
  );
}

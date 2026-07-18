// Provider-agnostic chat endpoint. Switch providers with the AI_PROVIDER env var:
//   AI_PROVIDER=anthropic (default) | gemini | nvidia
// Whichever provider is chosen, this route always returns the same shape to the
// frontend: { content: [{ type: "text", text: "..." }] }, so Assistant.jsx never
// needs to know or care which backend is running.

// Some providers (notably NVIDIA's free tier under load) can take a while to
// respond. Without this, Vercel's default ~10-15s limit kills the function
// with no error message at all — which looks exactly like infinite loading.
export const maxDuration = 60;

function normalizeAnthropicMessages(messages) {
  // Already in Anthropic's content-block shape — pass through.
  return messages;
}

function toGeminiContents(messages) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      return { role, parts: [{ text: m.content }] };
    }
    const parts = (m.content || []).map((block) => {
      if (block.type === "image") {
        return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
      }
      return { text: block.text || "" };
    });
    return { role, parts };
  });
}

function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const content = (m.content || []).map((block) => {
      if (block.type === "image") {
        return { type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
      }
      return { type: "text", text: block.text || "" };
    });
    return { role: m.role, content };
  });
}

async function callAnthropic({ system, messages, tools }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "Missing ANTHROPIC_API_KEY. Add it in Vercel's Environment Variables, then redeploy.", status: 500 };

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1500,
      system,
      messages: normalizeAnthropicMessages(messages),
      tools: tools || undefined,
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    console.error("Anthropic API error", upstream.status, JSON.stringify(data));
    const msg = data?.error?.message || data?.message || "Unknown upstream error.";
    return { error: `Anthropic API error (${upstream.status}): ${msg}`, status: upstream.status };
  }
  // Already in the normalized shape.
  return { data, status: 200 };
}

async function callGemini({ system, messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Missing GEMINI_API_KEY. Add it in Vercel's Environment Variables, then redeploy.", status: 500 };

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: toGeminiContents(messages),
      tools: [{ google_search: {} }],
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    console.error("Gemini API error", upstream.status, JSON.stringify(data));
    const msg = data?.error?.message || "Unknown upstream error.";
    return { error: `Gemini API error (${upstream.status}): ${msg}`, status: upstream.status };
  }

  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return { data: { content: [{ type: "text", text }] }, status: 200 };
}

async function callNvidia({ system, messages }) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { error: "Missing NVIDIA_API_KEY. Add it in Vercel's Environment Variables, then redeploy.", status: 500 };

  const model = process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";
  const upstream = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "system", content: system }, ...toOpenAIMessages(messages)],
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    console.error("NVIDIA API error", upstream.status, JSON.stringify(data));
    const msg = data?.error?.message || data?.message || "Unknown upstream error.";
    return { error: `NVIDIA API error (${upstream.status}): ${msg}`, status: upstream.status };
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return { data: { content: [{ type: "text", text }] }, status: 200 };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const provider = (
    process.env.AI_PROVIDER ||
    (process.env.NVIDIA_API_KEY && "nvidia") ||
    (process.env.GEMINI_API_KEY && "gemini") ||
    (process.env.ANTHROPIC_API_KEY && "anthropic") ||
    "anthropic"
  ).toLowerCase();

  try {
    let result;
    if (provider === "gemini") result = await callGemini(body);
    else if (provider === "nvidia") result = await callNvidia(body);
    else result = await callAnthropic(body);

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.data, { status: result.status });
  } catch (e) {
    console.error("Provider request failed", provider, e.message);
    return Response.json({ error: `Request to ${provider} failed: ${e.message}` }, { status: 502 });
  }
}

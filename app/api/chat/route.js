export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "Missing ANTHROPIC_API_KEY. Add it in your Vercel project's Settings → Environment Variables, then redeploy.",
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { system, messages, tools } = body;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system,
        messages,
        tools: tools || undefined,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("Anthropic API error", upstream.status, JSON.stringify(data));
      const msg = data?.error?.message || data?.message || "Unknown upstream error.";
      return Response.json({ error: `Anthropic API error (${upstream.status}): ${msg}` }, { status: upstream.status });
    }
    return Response.json(data, { status: upstream.status });
  } catch (e) {
    return Response.json({ error: "Upstream request to Anthropic failed." }, { status: 502 });
  }
}

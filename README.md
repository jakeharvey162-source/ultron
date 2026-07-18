# Ultron

A personal AI command center — real voice-to-voice conversation, a wake word, camera vision, and an interactive 3D viewer. Built with Next.js (App Router), Tailwind, Framer Motion, and Three.js.

## What it actually does

- **Chat**: business/IT expert, tutor for any high school or university subject, and real web-search-backed answers (current events, company/job info, market data — facts only, never predictions).
- **Voice Mode**: tap the waveform icon for a real hands-free call-style conversation — talk, it replies out loud, then automatically listens for your next line. No need to repeat the wake word each turn.
- **Wake word**: turn on "Voice wake word" in settings for ambient listening — say the assistant's name from anywhere in the app and it activates.
- **Memory**: tell it about yourself once in settings ("About you") and it remembers across conversations, like a real assistant would.
- **10 voice languages** supported for both listening and speaking.
- **Camera vision**: capture a photo and it's sent along with your question for analysis.
- **3D View tab**: a real interactive Three.js scene (shape / solar system / atom / DNA) — drag to rotate, pinch or scroll to zoom.
- **"open gmail" etc.**: opens real sites in a new tab. It can't launch native desktop apps (no web app can, for browser-sandboxing reasons) — but it can jump to any website instantly.
- Renamed anytime from settings; conversation history persists in the browser (localStorage).

## What it doesn't do (on purpose, not as a bug)

- No background/always-on listening when the tab is closed — no web app can do this.
- No autonomous job applications or sending emails on your behalf — it drafts, you send.
- No confident trading predictions — it reports real data and news, never a buy/sell call.

## Setup

Ultron works with three different AI providers — pick whichever you have a key for. All calls happen server-side, so your key is never exposed to the browser.

1. Copy `.env.example` to `.env.local` (or add these in Vercel's Settings → Environment Variables for a deployed site)
2. Set `AI_PROVIDER` to `anthropic`, `gemini`, or `nvidia`
3. Add the matching API key:
   - **Anthropic**: `ANTHROPIC_API_KEY` from https://console.anthropic.com — full web search + vision
   - **Gemini**: `GEMINI_API_KEY` from https://aistudio.google.com/apikey — has its own Google Search grounding + vision
   - **NVIDIA NIM**: `NVIDIA_API_KEY` from https://build.nvidia.com — cheapest option, open models, but **no web search** (can't look up real-time news/prices/jobs) and vision only on vision-capable models
4. Redeploy / restart the dev server

```bash
npm install
npm run dev
```

## Deploying

**Recommended (GitHub → Vercel):**
1. Push this repo to GitHub (see commands below)
2. In Vercel: New Project → Import the GitHub repo → it auto-detects Next.js
3. Add the `ANTHROPIC_API_KEY` environment variable before the first deploy (or add it after and redeploy)

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ultron.git
git push -u origin main
```

## Notes

- Voice input, the wake word, and spoken replies all need microphone/audio permission — best supported in Chrome (desktop and Android). Safari support is partial.
- Camera capture needs camera permission and HTTPS (Vercel deployments are HTTPS by default).

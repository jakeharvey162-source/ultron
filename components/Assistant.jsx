"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ThreeViewer from "@/components/ThreeViewer";
import VoiceMode from "@/components/VoiceMode";

const QUICK_LAUNCH = [
  { label: "Gmail", url: "https://mail.google.com" },
  { label: "Maps", url: "https://maps.google.com" },
  { label: "YouTube", url: "https://youtube.com" },
  { label: "GitHub", url: "https://github.com" },
];

const OPEN_MAP = {
  gmail: "https://mail.google.com", mail: "https://mail.google.com", email: "https://mail.google.com",
  maps: "https://maps.google.com", map: "https://maps.google.com",
  youtube: "https://youtube.com", github: "https://github.com", amazon: "https://amazon.com",
  netflix: "https://netflix.com", drive: "https://drive.google.com", google: "https://google.com",
  spotify: "https://open.spotify.com", twitter: "https://x.com", x: "https://x.com",
  linkedin: "https://linkedin.com", calendar: "https://calendar.google.com", chrome: null,
};

function detectScene(text) {
  const t = text.toLowerCase();
  if (/solar system|planets?|orbit/.test(t)) return "solar-system";
  if (/atom|electron|molecule/.test(t)) return "atom";
  if (/dna|helix|genetic/.test(t)) return "dna";
  if (/3d|visuali[sz]e|show me a|show me the/.test(t)) return "geometry";
  return null;
}

function parseDirections(text) {
  let m = text.match(/(?:directions?|map|navigate|route)\s+from\s+(.+?)\s+to\s+(.+)/i);
  if (m) return { origin: m[1].trim(), destination: m[2].trim() };
  m = text.match(/(?:directions?|map|navigate|route)\s+to\s+(.+?)\s+from\s+(.+)/i);
  if (m) return { origin: m[2].trim(), destination: m[1].trim() };
  m = text.match(/(?:directions?|navigate|route)\s+to\s+(.+)/i);
  if (m) return { origin: null, destination: m[1].trim() };
  return null;
}

function parseGoogleSearch(text) {
  const m = text.match(/^(?:go to google and |go to google,? )?search(?: google)?(?: for)?\s+(.+)/i);
  return m ? m[1].trim() : null;
}

function safeGet(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

export default function Assistant() {
  const [name, setName] = useState("Ultron");
  const [nameInput, setNameInput] = useState("Ultron");
  const [tab, setTab] = useState("command");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const [booted, setBooted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wakeMode, setWakeMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState("idle");
  const [sceneType, setSceneType] = useState("geometry");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [camError, setCamError] = useState(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [synthSupported, setSynthSupported] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [aboutYou, setAboutYou] = useState("");
  const [aboutYouInput, setAboutYouInput] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const scrollRef = useRef(null);
  const inputFieldRef = useRef(null);
  const recognitionRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const wakeModeRef = useRef(false);
  const callModeRef = useRef(false);
  const languageRef = useRef("en-US");

  useEffect(() => {
    setSpeechSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    setSynthSupported(!!window.speechSynthesis);
    if (window.speechSynthesis) {
      // Voices often load asynchronously; touching this early avoids the
      // very first speak() call being silently ignored on some browsers.
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    const storedName = safeGet("ultron:name", "Ultron");
    setName(storedName);
    setNameInput(storedName);
    setWakeMode(safeGet("ultron:wake", "false") === "true");
    setVoiceOut(safeGet("ultron:voiceout", "true") === "true");
    const storedAbout = safeGet("ultron:about", "");
    setAboutYou(storedAbout);
    setAboutYouInput(storedAbout);
    const storedLang = safeGet("ultron:lang", "en-US");
    setLanguage(storedLang);
    languageRef.current = storedLang;
    try {
      const raw = window.localStorage.getItem("ultron:history");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.length) {
        setMessages(parsed);
      } else {
        setMessages([{ role: "assistant", content: "Online. Rename me in settings, use your voice, or show me something with the camera. What are we working on?", ts: Date.now() }]);
      }
    } catch (e) {
      setMessages([{ role: "assistant", content: "Online. What are we working on?", ts: Date.now() }]);
    }
    const t = setTimeout(() => setBooted(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    try { window.localStorage.setItem("ultron:history", JSON.stringify(messages)); } catch (e) {}
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking, tab]);

  useEffect(() => {
    wakeModeRef.current = wakeMode;
  }, [wakeMode]);

  const speak = useCallback((text, force) => {
    if ((!voiceOut && !force) || !synthSupported || !text) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#`]/g, "");
      const resumeAfterSpeaking = () => {
        setSpeaking(false);
        if (callModeRef.current) {
          setTimeout(() => startRecognition("call"), 300);
        } else if (wakeModeRef.current) {
          setTimeout(() => startRecognition("wake"), 300);
        }
      };
      // Chrome silently drops an utterance queued in the same tick as
      // cancel() — a short delay avoids that race so speech reliably fires.
      setTimeout(() => {
        try {
          const utter = new SpeechSynthesisUtterance(clean);
          utter.rate = 1.03;
          utter.pitch = 0.92;
          utter.lang = languageRef.current;
          utter.onstart = () => {
            setSpeaking(true);
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch (e) {}
            }
          };
          utter.onend = resumeAfterSpeaking;
          utter.onerror = (ev) => {
            console.warn("speech synthesis error", ev.error);
            setError("Voice reply failed to play — check your device isn't on silent/mute, or try again.");
            resumeAfterSpeaking();
          };
          window.speechSynthesis.speak(utter);
        } catch (e) {
          setSpeaking(false);
        }
      }, 80);
    } catch (e) {
      setSpeaking(false);
    }
  }, [voiceOut, synthSupported]);

  const toggleVoiceOut = useCallback(() => {
    setVoiceOut((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("ultron:voiceout", String(next)); } catch (e) {}
      if (!next) { try { window.speechSynthesis.cancel(); } catch (e) {} setSpeaking(false); }
      return next;
    });
  }, []);

  const saveName = useCallback(() => {
    const clean = nameInput.trim() || "Ultron";
    setName(clean);
    try { window.localStorage.setItem("ultron:name", clean); } catch (e) {}
    const cleanAbout = aboutYouInput.trim();
    setAboutYou(cleanAbout);
    try { window.localStorage.setItem("ultron:about", cleanAbout); } catch (e) {}
    setSettingsOpen(false);
  }, [nameInput, aboutYouInput]);

  const changeLanguage = useCallback((lang) => {
    setLanguage(lang);
    languageRef.current = lang;
    try { window.localStorage.setItem("ultron:lang", lang); } catch (e) {}
  }, []);

  const copyMessage = useCallback(async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((prev) => (prev === idx ? null : prev)), 1600);
    } catch (e) {}
  }, []);

  const openSite = useCallback((url, label) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setMessages((prev) => [...prev, { role: "assistant", content: `Opened ${label}.`, ts: Date.now(), system: true }]);
  }, []);

  const sendMessage = useCallback(async (text, imageDataUrl) => {
    const trimmed = (text || "").trim();
    if (!trimmed && !imageDataUrl) return;
    if (thinking) return;

    if (!imageDataUrl) {
      const directions = parseDirections(trimmed);
      if (directions) {
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: trimmed, ts: Date.now() }]);
        const url = directions.origin
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(directions.origin)}&destination=${encodeURIComponent(directions.destination)}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directions.destination)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        const confirmMsg = directions.origin
          ? `Pulling up directions from ${directions.origin} to ${directions.destination} on Google Maps now.`
          : `Pulling up directions to ${directions.destination} on Google Maps now.`;
        setMessages((prev) => [...prev, { role: "assistant", content: confirmMsg, ts: Date.now() }]);
        speak(confirmMsg, callModeRef.current);
        return;
      }

      const searchQuery = parseGoogleSearch(trimmed);
      if (searchQuery) {
        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: trimmed, ts: Date.now() }]);
        window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, "_blank", "noopener,noreferrer");
        const confirmMsg = `Done — searching Google for "${searchQuery}" now.`;
        setMessages((prev) => [...prev, { role: "assistant", content: confirmMsg, ts: Date.now() }]);
        speak(confirmMsg, callModeRef.current);
        return;
      }

      const openMatch = trimmed.match(/^open\s+(.+)$/i);
      if (openMatch) {
        const key = openMatch[1].trim().toLowerCase();
        if (key in OPEN_MAP) {
          setInput("");
          setMessages((prev) => [...prev, { role: "user", content: trimmed, ts: Date.now() }]);
          if (OPEN_MAP[key] === null) {
            const msg = "Can't launch Chrome itself from inside a browser tab — but I can open any site in a new tab. Try \"open gmail.\"";
            setMessages((prev) => [...prev, { role: "assistant", content: msg, ts: Date.now() }]);
            speak(msg, callModeRef.current);
          } else {
            window.open(OPEN_MAP[key], "_blank", "noopener,noreferrer");
            const msg = `Opened ${openMatch[1].trim()}.`;
            setMessages((prev) => [...prev, { role: "assistant", content: msg, ts: Date.now() }]);
            speak(msg, callModeRef.current);
          }
          return;
        }
      }
      const scene = detectScene(trimmed);
      if (scene) { setSceneType(scene); setTab("3d"); }
    }

    const userMsg = { role: "user", content: trimmed || "What is this?", ts: Date.now(), image: imageDataUrl || null };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setPendingImage(null);
    setThinking(true);
    setError(null);

    try {
      const apiMessages = nextMessages
        .filter((m) => (m.role === "user" || m.role === "assistant") && !m.system)
        .map((m) => {
          if (m.image) {
            const base64 = m.image.split(",")[1];
            return { role: m.role, content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: m.content },
            ] };
          }
          return { role: m.role, content: m.content };
        });

      const memoryBlock = aboutYou.trim()
        ? `What you know about this specific person, from what they've told you before — use it naturally, don't just recite it back: ${aboutYou.trim()}\n\n`
        : "";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system: `${memoryBlock}You are ${name}, this person's personal command-center assistant, styled after a sharp human expert, not a chipper robot. Strengths: business & IT strategy/troubleshooting/code; tutoring any high school or university subject; real-world lookups via web search for business info, job postings, and market/financial data. On markets: report real facts and news, present multiple angles, never give a buy/sell call or confident prediction. On job search: find real postings and draft a strong tailored resume or cover letter, but you cannot submit applications or send emails yourself. You cannot control the user's OS or open native desktop apps. If given an image, describe and analyze what's relevant in it clearly and usefully. You may be speaking to them out loud via text-to-speech, so keep replies conversational and not overly long unless real depth is asked for. Keep answers tight by default; go deeper when asked.`,
          messages: apiMessages,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const reply = textBlocks || "Didn't get a usable response there — try rephrasing.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
      speak(reply, callModeRef.current);
    } catch (e) {
      if (e.name === "AbortError") {
        setError("The AI provider took over 55 seconds and timed out. NVIDIA's free tier can be slow under load — try again, or switch AI_PROVIDER to gemini or anthropic in Vercel's environment variables for a faster response.");
      } else {
        setError(typeof e.message === "string" ? e.message : "Connection dropped. Try again.");
      }
    } finally {
      setThinking(false);
    }
  }, [messages, thinking, name, speak, aboutYou]);

  const startRecognition = useCallback((mode) => {
    if (!speechSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = mode !== "once";
    rec.interimResults = mode === "call";
    rec.lang = languageRef.current;
    rec.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal && mode === "call") return;
      const transcript = result[0].transcript.trim();
      if (!transcript) return;
      if (mode === "wake") {
        const lower = transcript.toLowerCase();
        const wake = name.toLowerCase();
        const idx = lower.indexOf(wake);
        if (idx !== -1) {
          const command = transcript.slice(idx + wake.length).replace(/^[,.\s]+/, "");
          if (command) sendMessage(command);
        }
      } else {
        sendMessage(transcript);
      }
    };
    rec.onerror = (e) => {
      setMicStatus(e.error === "not-allowed" ? "blocked" : "idle");
      setListening(false);
      const shouldRestart = (mode === "wake" && wakeModeRef.current) || (mode === "call" && callModeRef.current);
      if (shouldRestart && e.error !== "not-allowed") {
        try { rec.start(); } catch (err) {}
      }
    };
    rec.onend = () => {
      const shouldRestart = (mode === "wake" && wakeModeRef.current) || (mode === "call" && callModeRef.current);
      if (shouldRestart) {
        try { rec.start(); } catch (err) { setListening(false); }
      } else {
        setListening(false);
      }
    };
    try {
      rec.start();
      setListening(true);
      setMicStatus("active");
      recognitionRef.current = rec;
    } catch (e) {
      setMicStatus("blocked");
    }
  }, [speechSupported, name, sendMessage]);

  const openVoiceMode = useCallback(() => {
    setVoiceModeOpen(true);
    callModeRef.current = true;
    if (wakeModeRef.current && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    startRecognition("call");
  }, [startRecognition]);

  const closeVoiceMode = useCallback(() => {
    callModeRef.current = false;
    setVoiceModeOpen(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setSpeaking(false);
    setListening(false);
    if (wakeModeRef.current) {
      setTimeout(() => startRecognition("wake"), 200);
    }
  }, [startRecognition]);

  const togglePushToTalk = useCallback(() => {
    if (listening) {
      recognitionRef.current && recognitionRef.current.stop();
      setListening(false);
      return;
    }
    startRecognition("once");
  }, [listening, startRecognition]);

  const toggleWakeMode = useCallback(() => {
    setWakeMode((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("ultron:wake", String(next)); } catch (e) {}
      if (next) startRecognition("wake");
      else if (recognitionRef.current) { recognitionRef.current.stop(); setListening(false); }
      return next;
    });
  }, [startRecognition]);

  const openCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch (e) {
      setCamError("Camera access blocked or unavailable on this device/browser.");
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setCameraOpen(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setPendingImage(canvas.toDataURL("image/jpeg", 0.85));
    closeCamera();
  }, [closeCamera]);

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 sm:px-8 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full ${wakeMode || speaking ? "animate-breathe" : ""}`} style={{ background: speaking ? "#FF6B35" : wakeMode ? "#FF6B35" : "#5C5A5C" }} />
          </span>
          <h1 className="font-display font-medium text-lg sm:text-xl tracking-tight truncate text-text">{name}</h1>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {synthSupported && (
            <button
              onClick={toggleVoiceOut}
              aria-label={voiceOut ? "Mute voice replies" : "Enable voice replies"}
              className="transition-colors p-1.5"
              style={{ color: voiceOut ? "#FF6B35" : "#5C5A5C" }}
            >
              {voiceOut ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 5 6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>
              )}
            </button>
          )}
          <button onClick={() => setSettingsOpen(true)} aria-label="Settings" className="text-faint hover:text-muted transition-colors p-1.5">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {/* Quick launch */}
      <div className="flex items-center gap-2 px-5 sm:px-8 pb-3 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => sendMessage("Give me a world pulse: the 4-5 biggest things happening globally right now. For each, a bold-style short headline then one or two sentences of real substance, pulling from current sources. Cover a mix of world affairs, business/tech, and one lighter cultural story. Then a one-line 'why it matters' close. Keep the whole thing tight and scannable.")}
          disabled={thinking}
          className="font-body text-[13px] font-medium px-3.5 py-1.5 whitespace-nowrap flex-shrink-0 rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
        >
          🌍 World Pulse
        </button>
        <button
          onClick={() => { setInput("Help me draft "); inputFieldRef.current?.focus(); }}
          className="font-body text-[13px] font-medium px-3.5 py-1.5 whitespace-nowrap flex-shrink-0 rounded-full bg-surface text-muted hover:text-text hover:bg-surface2 transition-colors"
        >
          ✍️ Draft
        </button>
        {QUICK_LAUNCH.map((q) => (
          <button key={q.label} onClick={() => openSite(q.url, q.label)} className="font-body text-[13px] font-medium px-3.5 py-1.5 whitespace-nowrap flex-shrink-0 rounded-full bg-surface text-muted hover:text-text hover:bg-surface2 transition-colors">
            {q.label}
          </button>
        ))}
        {speaking ? (
          <span className="font-mono text-[10px] text-accent px-1 flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
            speaking…
          </span>
        ) : wakeMode ? (
          <span className="font-mono text-[10px] text-accent px-1 flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
            listening for &ldquo;{name}&rdquo;
          </span>
        ) : null}
      </div>

      {/* Segmented tabs */}
      <div className="px-5 sm:px-8 pb-4 flex-shrink-0">
        <div className="relative inline-flex bg-surface rounded-full p-1">
          {["command", "pulse", "3d"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative font-body text-[13px] font-semibold px-4 py-1.5 rounded-full z-10 transition-colors" style={{ color: tab === t ? "#0B0B0D" : "#8C8A8A" }}>
              {tab === t && <motion.div layoutId="tabPill" className="absolute inset-0 bg-accent rounded-full -z-10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              {t === "command" ? "Command" : t === "pulse" ? "Pulse" : "3D View"}
            </button>
          ))}
        </div>
      </div>

      {tab === "command" ? (
        <>
          <div className="flex-1 min-h-0 px-5 sm:px-8">
            <div className="h-full overflow-y-auto" ref={scrollRef}>
              {!booted && <div className="font-mono text-xs pt-4 text-accent">bringing systems online…</div>}
              {booted && messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className={`flex mb-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[86%] sm:max-w-[68%]">
                    {m.system ? (
                      <div className="font-body text-xs text-faint italic px-1">{m.content}</div>
                    ) : (
                      <div className="group relative">
                        <div className={`font-body text-[14.5px] leading-relaxed px-4 py-3 rounded-2xl whitespace-pre-wrap ${m.role === "user" ? "bg-accent/15 text-text rounded-br-md" : "bg-surface text-text rounded-bl-md"}`}>
                          {m.image && <img src={m.image} alt="captured" className="max-w-full mb-2 rounded-xl" style={{ maxHeight: 200 }} />}
                          {m.content}
                        </div>
                        {m.role === "assistant" && (
                          <button
                            onClick={() => copyMessage(m.content, i)}
                            aria-label="Copy to clipboard"
                            className="absolute -bottom-2 right-2 text-[10px] font-mono px-2 py-1 rounded-full bg-surface2 text-faint opacity-40 sm:opacity-0 sm:group-hover:opacity-100 hover:opacity-100 focus:opacity-100 transition-opacity hover:text-text"
                          >
                            {copiedIdx === i ? "copied" : "copy"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {thinking && (
                <div className="flex items-center gap-1.5 px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-faint" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              )}
              {error && <div className="font-body text-xs px-1 py-2 text-accent">{error}</div>}
              {camError && <div className="font-body text-xs px-1 py-2 text-accent">{camError}</div>}
              <div className="h-2" />
            </div>
          </div>

          {/* Input pill */}
          <div className="px-5 sm:px-8 pb-6 pt-2 flex-shrink-0">
            {pendingImage && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 w-fit rounded-full bg-surface">
                <img src={pendingImage} alt="pending" className="w-7 h-7 object-cover rounded-full" />
                <span className="font-mono text-[10px] text-muted">photo attached</span>
                <button onClick={() => setPendingImage(null)} className="text-accent font-mono text-xs px-1">×</button>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-surface rounded-full px-1.5 py-1.5 shadow-lift">
              <button onClick={openCamera} aria-label="Camera" className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-text hover:bg-surface2 transition-colors">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              {speechSupported && (
                <button onClick={openVoiceMode} aria-label="Voice mode" className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-muted hover:text-text hover:bg-surface2 transition-colors">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 10v4M6 6v12M10 3v18M14 6v12M18 8v8M22 10v4"/></svg>
                </button>
              )}
              {speechSupported && (
                <button onClick={togglePushToTalk} aria-label="Voice input" className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors" style={{ color: listening ? "#FF6B35" : "#8C8A8A", background: listening ? "rgba(255,107,53,0.12)" : "transparent" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
                </button>
              )}
              <input ref={inputFieldRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage(input, pendingImage)} placeholder={`Ask ${name} anything`} className="font-body flex-1 min-w-0 outline-none text-[14.5px] bg-transparent px-2 text-text placeholder:text-faint" />
              <button onClick={() => sendMessage(input, pendingImage)} disabled={(!input.trim() && !pendingImage) || thinking} aria-label="Send" className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-accent text-bg disabled:opacity-25 transition-opacity">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col px-5 sm:px-8 pb-6">
          <div className="flex gap-2 pb-3 flex-wrap flex-shrink-0">
            {[["geometry", "Shape"], ["solar-system", "Solar System"], ["atom", "Atom"], ["dna", "DNA"]].map(([k, l]) => (
              <button key={k} onClick={() => setSceneType(k)} className="font-body text-[12.5px] font-medium px-3.5 py-1.5 rounded-full transition-colors" style={{ color: sceneType === k ? "#0B0B0D" : "#8C8A8A", background: sceneType === k ? "#FF6B35" : "#151517" }}>{l}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 rounded-3xl overflow-hidden bg-surface">
            <ThreeViewer sceneType={sceneType} />
          </div>
          <div className="font-mono text-[10px] text-center pt-3 text-faint">drag to rotate · scroll or pinch to zoom</div>
        </div>
      )}

      {/* Settings sheet */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSettingsOpen(false)} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 32, stiffness: 340 }} className="fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl bg-surface/95 backdrop-blur-xl px-6 pt-6 pb-8 max-w-lg mx-auto">
              <div className="w-9 h-1 rounded-full bg-faint/40 mx-auto mb-5" />
              <h2 className="font-display font-medium text-lg mb-5 text-text">Settings</h2>
              <label className="font-mono text-[10px] uppercase tracking-wide text-faint">Assistant name</label>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="font-body w-full mt-1.5 mb-5 px-4 py-2.5 rounded-xl outline-none text-[14.5px] bg-surface2 text-text" />
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-body text-[14.5px] text-text">Voice wake word</div>
                  <div className="font-body text-xs text-faint mt-0.5">say &ldquo;{name}&rdquo; while the app is open</div>
                </div>
                <button onClick={toggleWakeMode} className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors" style={{ background: wakeMode ? "#FF6B35" : "#242327" }}>
                  <motion.span animate={{ x: wakeMode ? 22 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="absolute top-0.5 w-5 h-5 rounded-full bg-text" />
                </button>
              </div>
              {synthSupported && (
                <div className="flex items-center justify-between mt-5 mb-2">
                  <div>
                    <div className="font-body text-[14.5px] text-text">Speak replies aloud</div>
                    <div className="font-body text-xs text-faint mt-0.5">true voice-to-voice — it talks back</div>
                  </div>
                  <button onClick={toggleVoiceOut} className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors" style={{ background: voiceOut ? "#FF6B35" : "#242327" }}>
                    <motion.span animate={{ x: voiceOut ? 22 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="absolute top-0.5 w-5 h-5 rounded-full bg-text" />
                  </button>
                </div>
              )}
              {speechSupported && (
                <div className="mt-5">
                  <label className="font-mono text-[10px] uppercase tracking-wide text-faint">Voice language</label>
                  <select value={language} onChange={(e) => changeLanguage(e.target.value)} className="font-body w-full mt-1.5 px-4 py-2.5 rounded-xl outline-none text-[14.5px] bg-surface2 text-text">
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="es-ES">Spanish</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                    <option value="pt-BR">Portuguese (Brazil)</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="ar-SA">Arabic</option>
                    <option value="zh-CN">Chinese (Mandarin)</option>
                    <option value="ja-JP">Japanese</option>
                  </select>
                </div>
              )}
              <div className="mt-5">
                <label className="font-mono text-[10px] uppercase tracking-wide text-faint">What {name} should know about you</label>
                <textarea value={aboutYouInput} onChange={(e) => setAboutYouInput(e.target.value)} placeholder="e.g. I'm a nursing student, I run a small landscaping business on weekends, prefer short direct answers…" rows={3} className="font-body w-full mt-1.5 px-4 py-2.5 rounded-xl outline-none text-[14px] bg-surface2 text-text placeholder:text-faint resize-none" />
              </div>
              {micStatus === "blocked" && <div className="font-body text-xs mt-3 text-accent">Mic permission blocked — enable it in your browser's site settings.</div>}
              {!speechSupported && <div className="font-body text-xs mt-3 text-accent">Voice isn't supported in this browser — try Chrome.</div>}
              {!synthSupported && <div className="font-body text-xs mt-3 text-accent">This browser can't speak replies aloud.</div>}
              <div className="flex gap-2 mt-6">
                <button onClick={saveName} className="font-body font-semibold flex-1 py-2.5 rounded-xl text-[14px] bg-accent text-bg">Save</button>
                <button onClick={() => setSettingsOpen(false)} className="font-body font-medium flex-1 py-2.5 rounded-xl text-[14px] text-muted bg-surface2">Close</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Camera sheet */}
      <AnimatePresence>
        {cameraOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center px-6">
            <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[65vh] rounded-2xl" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-3 mt-7">
              <button onClick={capturePhoto} className="font-body font-semibold px-7 py-3 rounded-full bg-accent text-bg text-[14px]">Capture</button>
              <button onClick={closeCamera} className="font-body font-medium px-7 py-3 rounded-full text-muted bg-surface text-[14px]">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VoiceMode
        open={voiceModeOpen}
        onClose={closeVoiceMode}
        name={name}
        listening={listening}
        speaking={speaking}
        thinking={thinking}
        micStatus={micStatus}
        language={language}
        lastUser={[...messages].reverse().find((m) => m.role === "user" && !m.system)?.content || ""}
        lastAssistant={[...messages].reverse().find((m) => m.role === "assistant" && !m.system)?.content || ""}
      />
    </div>
  );
}

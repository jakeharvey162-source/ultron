"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Organic, hand-drawn-feeling blob — deliberately not a generic circle/ring.
// Built from layered noise-perturbed radii so it reads as alive, not mechanical.
function Blob({ state }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const size = canvas.parentElement.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + "px";
      canvas.style.height = size + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    const points = 64;
    let t = 0;

    function draw() {
      const size = canvas.width;
      const cx = size / 2, cy = size / 2;
      const base = size * 0.24;
      const s = stateRef.current;

      const amp = s === "listening" ? size * 0.05 : s === "speaking" ? size * 0.065 : size * 0.02;
      const speed = s === "listening" ? 0.045 : s === "speaking" ? 0.08 : 0.018;
      t += speed;

      ctx.clearRect(0, 0, size, size);

      // soft outer glow
      const glow = ctx.createRadialGradient(cx, cy, base * 0.3, cx, cy, base * 2.1);
      const glowColor = s === "speaking" ? "255,107,53" : s === "listening" ? "201,162,39" : "140,138,138";
      glow.addColorStop(0, `rgba(${glowColor},0.22)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // organic blob path
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const n =
          Math.sin(angle * 3 + t) * 0.5 +
          Math.sin(angle * 5 - t * 1.4) * 0.3 +
          Math.sin(angle * 2 + t * 0.6) * 0.4;
        const r = base + n * amp;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(cx - base, cy - base, cx + base, cy + base);
      if (s === "speaking") {
        grad.addColorStop(0, "#FF6B35");
        grad.addColorStop(1, "#B34E27");
      } else if (s === "listening") {
        grad.addColorStop(0, "#F5F3EF");
        grad.addColorStop(1, "#C9A227");
      } else {
        grad.addColorStop(0, "#3A3836");
        grad.addColorStop(1, "#242327");
      }
      ctx.fillStyle = grad;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="w-full max-w-[280px] aspect-square mx-auto">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function VoiceMode({ open, onClose, name, listening, speaking, thinking, lastUser, lastAssistant, micStatus, language }) {
  const state = speaking ? "speaking" : listening ? "listening" : "idle";
  const label = speaking ? "speaking" : thinking ? "thinking" : listening ? "listening" : "paused";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col bg-bg"
        >
          <div className="flex items-center justify-between px-6 pt-6 flex-shrink-0">
            <div className="font-mono text-[11px] uppercase tracking-wide text-faint">voice mode &middot; {language.split("-")[0]}</div>
            <button onClick={onClose} aria-label="End voice mode" className="text-muted hover:text-text transition-colors p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
            <Blob state={state} />

            <div className="text-center">
              <div className="font-display text-2xl text-text mb-1">{name}</div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-faint">{label}</div>
            </div>

            {micStatus === "blocked" && (
              <div className="font-body text-sm text-accent text-center max-w-xs">
                Microphone access is blocked. Enable it in your browser's site settings to talk.
              </div>
            )}

            <div className="w-full max-w-sm space-y-3">
              {lastUser && (
                <div className="font-body text-sm text-muted text-center leading-relaxed">&ldquo;{lastUser}&rdquo;</div>
              )}
              {lastAssistant && (
                <div className="font-body text-[15px] text-text text-center leading-relaxed">{lastAssistant}</div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center pb-12 pt-4 flex-shrink-0">
            <button
              onClick={onClose}
              className="font-body font-semibold text-[14px] px-8 py-3.5 rounded-full bg-surface text-text hover:bg-surface2 transition-colors"
            >
              End
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

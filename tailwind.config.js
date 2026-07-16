/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B0D",
        surface: "#151517",
        surface2: "#1D1D20",
        surface3: "#242327",
        accent: "#FF6B35",
        accentDim: "#B34E27",
        text: "#F5F3EF",
        muted: "#8C8A8A",
        faint: "#5C5A5C",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        soft: "0 8px 30px rgba(0,0,0,0.35)",
        lift: "0 2px 12px rgba(0,0,0,0.25)",
        glow: "0 0 24px rgba(255,107,53,0.25)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.25)", opacity: "1" },
        },
        riseIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        breathe: "breathe 2.6s ease-in-out infinite",
        riseIn: "riseIn 0.35s cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};

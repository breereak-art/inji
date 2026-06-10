import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#030407",
        deep: "#060a12",
        surface: "#0b101c",
        elevated: "#101726",
        "inj-cyan": "#00d4ff",
        "inj-cyan-soft": "#5ee2ff",
        "inj-indigo": "#4f46e5",
        "txt-primary": "var(--text-primary)",
        "txt-secondary": "var(--text-secondary)",
        "txt-tertiary": "var(--text-tertiary)",
      },
      borderColor: {
        dim: "var(--border-dim)",
        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
        accent: "var(--border-accent)",
      },
      fontFamily: {
        display: ["'Cabinet Grotesk'", "var(--font-geist-sans)", "sans-serif"],
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      maxWidth: {
        wrap: "1120px",
      },
    },
  },
  plugins: [],
} satisfies Config;

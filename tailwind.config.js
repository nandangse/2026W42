/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // V1.9 design-system anchors (kept as named tokens for reuse)
        ink: "#22303C",
        paper: "#F4F2EC",
        accent: "#E8600A",
        // the meaning colours of the Genie Table Standard (docs/GENIE-TABLE-STANDARD.md)
        navy: "#16232F",
        line: "#E2E0DA",
        muted: "#8A94A0",
        dim: "#5A6672",
        amber: "#F5B32B",
        bad: "#B3261E",
        warn: "#D97706",
        good: "#0D7A3F",
        navylink: "#1B3A5C",
      },
    },
  },
  plugins: [],
};

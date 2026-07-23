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
      },
    },
  },
  plugins: [],
};

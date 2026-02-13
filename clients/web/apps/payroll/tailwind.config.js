/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [require('@tamshai/tailwind-config')],
  theme: {
    extend: {},
  },
  plugins: [],
}

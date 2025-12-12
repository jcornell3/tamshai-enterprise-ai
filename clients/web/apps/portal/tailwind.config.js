/** @type {import('tailwindcss').Config} */
export default {
  presets: [require('@tamshai/tailwind-config/tailwind.config.js')],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/auth/src/**/*.{js,ts,jsx,tsx}',
  ],
};

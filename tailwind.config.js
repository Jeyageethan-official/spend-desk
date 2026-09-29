/** @type {import('tailwindcss').Config} */
export default {
  // The app is intentionally light-only. Without this, Tailwind's `dark:`
  // utilities follow the device preference and make Settings dark on devices
  // that are set to dark mode, even when the app removes the `dark` class.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spenddesk: {
          DEFAULT: '#116b4e',
          hover: '#0d5940',
          dark: '#093f2d',
          light: '#188663',
          bg: '#eaf5f0',
        }
      }
    },
  },
  plugins: [],
}

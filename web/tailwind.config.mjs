/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        background: '#020617',
        'background-elevated': 'rgba(15,23,42,0.9)',
        foreground: '#e2e8f0',
        primary: '#38bdf8',
        'primary-dark': '#0ea5e9',
        'card-border': 'rgba(148,163,184,0.25)',
        accent: '#1e293b',
        amber: '#fbbf24',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

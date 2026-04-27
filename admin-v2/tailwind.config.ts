import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        background: '#0b1021',
        panel: '#0f172a',
        primary: '#67e8f9',
        accent: '#22d3ee',
        border: '#1e293b',
        muted: '#94a3b8',
      },
    },
  },
  plugins: [],
};

export default config;

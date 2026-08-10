import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0b0f',
        panel: '#15151d',
        panel2: '#1e1e29',
        line: '#2a2a38',
        muted: '#8b8ba3',
        // Verde de dinheiro no lugar do rosa do TikTok: este app fala de
        // receita, e a cor de destaque deve concordar com o assunto.
        brand: '#10b981',
        cyan: '#25f4ee',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;

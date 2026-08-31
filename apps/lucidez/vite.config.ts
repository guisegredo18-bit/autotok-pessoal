import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Base relativa para o build funcionar tanto na raiz de um dominio quanto
  // servido de um subdiretorio (GitHub Pages, pasta estatica, arquivo local).
  base: './',
  build: { outDir: 'dist', sourcemap: false },
});

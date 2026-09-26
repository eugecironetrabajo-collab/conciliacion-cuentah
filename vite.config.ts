import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'web',
  plugins: [tailwindcss()],
  server: {
    port: 43127,
    proxy: { '/api': 'http://127.0.0.1:43128' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
})

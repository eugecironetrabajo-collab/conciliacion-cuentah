import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'web',
  plugins: [tailwindcss()],
  server: {
    port: Number(process.env.VITE_PORT ?? 43127),
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 43128}` },
  },
  build: { outDir: '../dist', emptyOutDir: true },
})

import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const buildId = process.env.BUILD_ID ?? new Date().toISOString().slice(0, 16).replace('T', '-')

export default defineConfig({
  root: 'web',
  define: {
    __MEC_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [tailwindcss()],
  resolve: {
    alias: { buffer: 'buffer/' },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 43127),
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 43128}` },
  },
  build: { outDir: '../dist', emptyOutDir: true },
})

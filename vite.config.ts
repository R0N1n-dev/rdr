import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Capacitor serves the build from file-like origins; relative asset paths are required.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1800,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
  },
})

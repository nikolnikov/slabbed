import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The WebP encoder loads its WASM by relative URL, which Vite's dev pre-bundling would break.
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  define: {
    // Shown in Settings so it's easy to tell which deploy a device is running.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})

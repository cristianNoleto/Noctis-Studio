import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Interface do app desktop. `base: './'` porque o Electron carrega dist/index.html por file://.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: { port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
})

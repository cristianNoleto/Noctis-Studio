import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // barra no final: sem ela o proxy também captura a rota do app /api-docs
      '/api/': 'http://localhost:3001',
    },
  },
})

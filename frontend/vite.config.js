import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: true,                      
    allowedHosts: ['.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Flask 서버 주소
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

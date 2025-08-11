import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', req.method, req.url)
            // Forward authentication headers and cookies
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie);
            }
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Forward Set-Cookie headers back to the client
            if (proxyRes.headers['set-cookie']) {
              res.setHeader('Set-Cookie', proxyRes.headers['set-cookie']);
            }
          })
        }
      }
    }
  }
})
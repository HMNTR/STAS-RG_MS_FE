import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const localApiTarget = 'http://localhost:3333'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  server: {
    proxy: {
      '/api': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "localhost" },
        cookiePathRewrite: { "*": "/" },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie'];
            if (cookies) {
              proxyRes.headers['set-cookie'] = cookies.map(cookie =>
                cookie
                  .replace(/;\s*secure/gi, '')
                  .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax')
              );
            }
          });
        },
        onProxyReq: (proxyReq, req) => {
          if (req.headers.cookie) {
            proxyReq.setHeader('cookie', req.headers.cookie);
          }
        }
      },
      '/uploads': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "localhost" },
        cookiePathRewrite: { "*": "/" }
      },
      '/files': {
        target: localApiTarget,
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: { "*": "localhost" },
        cookiePathRewrite: { "*": "/" }
      }
    }
  }
})
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: false,
    devOptions: { enabled: false },
    manifest: {
      id: '/', name: 'Seam Note', short_name: 'Seam Note', lang: 'ko',
      description: '로컬 저장된 원고를 인터넷 없이 열고 편집하는 글쓰기 공간',
      start_url: '/', scope: '/', display: 'standalone', theme_color: '#FCFBF8', background_color: '#FCFBF8',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      navigateFallback: 'index.html',
      navigateFallbackAllowlist: [/^\/$/, /^\/notes\/[^/]+\/?$/],
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      runtimeCaching: [], cleanupOutdatedCaches: true, skipWaiting: false, clientsClaim: false,
    },
  })],
  server: {
    proxy: {
      '/api': {
        target: process.env.SEAM_NOTE_API_TARGET || 'http://127.0.0.1:18765',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

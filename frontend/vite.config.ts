import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const deploymentHeaders = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const previewHeaders = Object.fromEntries(deploymentHeaders.headers.find(rule => rule.source === '/(.*)')!.headers.map(header => [header.key, header.value]))

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
      navigateFallbackAllowlist: [/^\/$/, /^\/notes\/[^/]+\/?$/, /^\/(login|register)\/?$/, /^\/auth\/complete\/?$/],
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      importScripts: ['/sw-retain-assets.js'],
      runtimeCaching: [{
        urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css)$/.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'seam-note-previous-assets', expiration: { maxEntries: 200 } },
      }],
      cleanupOutdatedCaches: true, skipWaiting: true, clientsClaim: true,
    },
  })],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.SEAM_NOTE_API_TARGET || 'http://127.0.0.1:18765',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 5175, strictPort: true, headers: previewHeaders },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

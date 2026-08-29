/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // 번들된 웹폰트까지 프리캐시해야 오프라인에서 같은 화면이 나온다
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
      },
      manifest: {
        name: 'Memonowz',
        short_name: 'Memonowz',
        description: '덱으로 외우고, 틀린 것만 다시 푸는 암기 앱',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAF6EC',
        theme_color: '#FAF6EC',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  // @ts-expect-error Vitest extends Vite's config with a test key.
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
})

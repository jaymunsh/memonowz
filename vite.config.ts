/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icon.svg',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-192-maskable.png',
        'icon-512-maskable.png',
      ],
      workbox: {
        // woff2 는 프리캐시하지 않는다. @fontsource 의 한글 서브셋이 274개(3.9MB)라
        // 전부 받으면 설치 첫 실행이 무거워진다. 실제로 렌더된 서브셋만 런타임에 캐시한다.
        globPatterns: ['**/*.{js,css,html,png}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-subsets',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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

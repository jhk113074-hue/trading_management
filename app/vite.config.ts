import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'YSACC 업무포탈',
        short_name: 'YSACC',
        description: 'YSACC CO., LTD. 업무 관리 포탈',
        theme_color: '#C41E3A',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ko',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: '업무 리스트',
            short_name: '업무',
            url: '/list',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: '주문관리',
            short_name: '주문',
            url: '/orders',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: '견적관리',
            short_name: '견적',
            url: '/proforma-invoices',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Firebase 실시간 데이터는 캐시 제외, 앱 셸만 캐시
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/container/],
        runtimeCaching: [
          {
            // Firebase Firestore는 항상 네트워크 우선
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Firebase Auth도 네트워크 우선
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // 나머지 Google API도 네트워크 우선
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-apis',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true, // 개발 환경에서도 PWA 테스트 가능
      },
    }),
  ],
})

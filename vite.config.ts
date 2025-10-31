/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import viteCompression from 'vite-plugin-compression'
import basicSsl from '@vitejs/plugin-basic-ssl'
// Generate a simple version hash for cache busting
const getBuildHash = () => {
  // Use a timestamp-based hash for version tracking
  return Date.now().toString(36).slice(-7);
};

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // Allow access from network (0.0.0.0)
    port: 5173,
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_HASH__: JSON.stringify(getBuildHash()),
  },
  plugins: [
    react(),
    basicSsl(), // Enable HTTPS with self-signed certificates for iOS Safari WebSocket compatibility
    // Pre-compress assets to ensure gzip/brotli are available in production
    viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
    viteCompression({ algorithm: 'gzip', ext: '.gz' }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      workbox: {
        navigationPreload: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        skipWaiting: false,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(?:woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 24 * 60 * 60 // 60 days
              }
            }
          }
        ]
      },
      manifest: {
        name: 'NRIC-1',
        short_name: 'NRIC-1',
        description: 'An Asciified Nostr client. ',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['social', 'utilities', 'entertainment'],
        icons: [
          {
            src: '/favicon.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'New Post',
            short_name: 'Post',
            description: 'Create a new Nostr post',
            url: '/?action=new-post',
            icons: [
              {
                src: '/favicon.png',
                sizes: '96x96'
              }
            ]
          }
        ]
      }
    })
  ],
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', '@tanstack/react-router'],
          motion: ['framer-motion'],
          nostr: ['nostr-tools'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
  }
})

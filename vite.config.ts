import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Domination can ship two ways:
//   1. As an installable PWA — the Vite + React + Three.js static build
//      that any modern browser can install (Edge/Chrome on Windows → a
//      real desktop window with native frame, fully offline after first load).
//   2. As a native desktop app via Tauri (run `npm run tauri:dev`).
//      Tauri expects the dev server at port 1420 (see src-tauri/tauri.conf.json).
//
// We skip the PWA service-worker registration when building for Tauri —
// WebView2 rejects SW registration from the `tauri://` origin, which
// would only produce noisy console errors in production builds.
const isTauri =
  process.env.TAURI_DEV === '1' || process.env.TAURI_BUILD === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(isTauri ? [] : [VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Files that ship alongside the app shell but aren't referenced by
      // a JS import — these need to be precached so they work offline.
      includeAssets: ['favicon.svg', 'countries-110m.json'],
      manifest: {
        name: 'Domination 2026 — Worldwide Conquest',
        short_name: 'Domination',
        description: 'Conquer the world, one country at a time.',
        theme_color: '#050810',
        background_color: '#050810',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
        runtimeCaching: [
          {
            // The TopoJSON world atlas is the largest single asset and is
            // fetched by src/game/data/borders.ts (local-first, CDN fallback).
            // Cache it forever on first successful response.
            urlPattern: /countries-110m\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'topo-data',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Disabled: dev SW tends to fight Vite HMR. Production installable
        // build is what we care about.
        enabled: false,
      },
    })]),
  ],
  server: {
    host: true, // LAN-visible for testing the installable build
    port: 1420, // Tauri devUrl — keep in sync with src-tauri/tauri.conf.json
    strictPort: true,
  },
});

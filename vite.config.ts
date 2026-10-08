/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Caminhos relativos para funcionar em qualquer subpasta (ex.: GitHub Pages em /treino/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // Absoluto: um id relativo seria resolvido contra a raiz do site e coincidiria com o do Treino antigo.
        id: '/treino/',
        name: 'Treino — braços e fascite plantar',
        short_name: 'Treino',
        description:
          'Treinos de até 1 hora: 15 min de aquecimento, exercícios para fascite plantar e foco no desenvolvimento dos braços. Sincroniza entre celular e computador.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f9f9f7',
        theme_color: '#6b3fd4',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  build: {
    // O app inteiro fica em cache para uso offline; um único pacote é aceitável.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

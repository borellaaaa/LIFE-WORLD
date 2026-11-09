/**
 * Build em ARQUIVO ÚNICO: gera dist-single/life-world-3d.html com todo o jogo
 * embutido (JS, CSS, fontes, física WASM e o modelo do personagem em base64).
 * Abre direto com duplo clique (file://), sem servidor e sem internet.
 *
 *   npm run build:single
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const glb = readFileSync(fileURLToPath(new URL('./public/models/character.glb', import.meta.url)));
const characterDataUri = `data:model/gltf-binary;base64,${glb.toString('base64')}`;

export default defineConfig({
  base: './',
  // não copia public/ (o modelo vai embutido no HTML)
  publicDir: false,
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: 'lifeworld-rename-output',
      closeBundle() {
        const from = 'dist-single/index.html';
        if (existsSync(from)) renameSync(from, 'dist-single/life-world-3d.html');
      },
    },
  ],
  define: {
    'import.meta.env.VITE_CHARACTER_URL': JSON.stringify(characterDataUri),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
  },
});

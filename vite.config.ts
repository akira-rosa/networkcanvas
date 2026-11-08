import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds to a single self-contained dist/index.html that runs offline
// (double-click to open, no server or internet needed).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});

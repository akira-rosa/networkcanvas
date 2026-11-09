import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Builds to a single self-contained dist/index.html that runs offline
// (double-click to open, no server or internet needed).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_REPO__: JSON.stringify(pkg.homepage.replace(/#.*$/, '')) },
  build: { assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 },
});

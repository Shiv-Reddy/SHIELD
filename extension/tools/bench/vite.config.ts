import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Bundles tools/bench/page-entry.ts into one classic script the driver injects
 * into a page. An IIFE for the same reason the content script is one: it is
 * evaluated as a plain script, where `import` is not available.
 */
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  define: {
    __SHIELD_BUILD__: JSON.stringify('bench'),
    __SHIELD_DEV__: 'false',
  },
  build: {
    outDir: fileURLToPath(new URL('./.out', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./page-entry.ts', import.meta.url)),
      output: { format: 'iife', entryFileNames: 'page.js' },
    },
  },
});

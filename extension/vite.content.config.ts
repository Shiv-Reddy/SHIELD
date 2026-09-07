import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Second build pass: the content script, on its own.
 *
 * Content scripts run in a classic (non-module) script context, so they can't
 * use `import` at runtime. That rules out Rollup's shared-chunk output, which
 * the main pass depends on. Rather than cripple the main build, the content
 * script gets a separate pass that bundles it into one self-contained IIFE.
 *
 * `emptyOutDir: false` because this pass runs after the main one and must not
 * wipe its output. `publicDir: false` so the static files aren't copied twice.
 */
/** Must match vite.config.ts — see the note there on why builds are stamped. */
const buildStamp = new Date().toLocaleString('sv-SE'); // local time, ISO-like

export default defineConfig({
  publicDir: false,
  define: { __SHIELD_BUILD__: JSON.stringify(buildStamp) },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/content/content-script.ts', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'content-script.js',
      },
    },
  },
});

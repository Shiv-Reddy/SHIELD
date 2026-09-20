import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * Main build pass: the popup page and the background service worker.
 *
 * These two can ship as ES modules (MV3 allows `"type": "module"` on the
 * service worker, and the popup is a normal extension page), so Rollup is
 * free to emit shared chunks here. The content script cannot — see
 * vite.content.config.ts for why it gets its own pass.
 */
/**
 * A stamp identifying this exact build, logged on startup by both the service
 * worker and the content script.
 *
 * Chrome will happily keep running a previous build of an extension — a cached
 * service worker, a second copy loaded from another folder, a reload that did
 * not take. Every one of those looks identical to "the code is broken" from the
 * console, and the only way to tell them apart is for the running code to say
 * which build it is.
 */
const buildStamp = new Date().toLocaleString('sv-SE'); // local time, ISO-like

export default defineConfig({
  root: src,
  /**
   * React and Tailwind, for the popup only.
   *
   * The popup is the one surface a person looks at, and it was 39 imperative
   * DOM handles reading and writing the same elements from several places —
   * the shape a declarative renderer removes rather than tidies. Nothing else
   * in the extension gains from either: the service worker has no DOM, the
   * content script draws overlay rectangles at computed coordinates, and the
   * offscreen document has no UI at all.
   *
   * Neither dependency reaches the pipeline. Detection, redaction, the seal
   * and transport are unchanged and untouched by this, which is why the popup
   * could be rebuilt four days before a demo at all.
   */
  plugins: [react(), tailwindcss()],
  define: {
    __SHIELD_BUILD__: JSON.stringify(buildStamp),
    // Off unless asked for, so the element-map export is absent from any
    // build a user could install rather than merely switched off in one.
    __SHIELD_DEV__: JSON.stringify(process.env.SHIELD_DEV === '1'),
  },
  resolve: {
    /**
     * Opt into ONNX Runtime's "external wasm" entry point.
     *
     * Without this, importing onnxruntime-web resolves to its bundled build,
     * whose `new URL(...)` reference to the .wasm makes Vite emit a second
     * 25MB copy into dist/assets — on top of the one we deliberately copy into
     * dist/ort (microsoft/onnxruntime#24009). Shipping 52MB and loading whichever
     * copy ORT happened to resolve is not acceptable in an extension whose
     * resource usage is 20% of its score. This condition makes ORT load the
     * binary from `ort.env.wasm.wasmPaths` instead, which we point at our copy.
     */
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  // Static files copied verbatim to dist/ — manifest.json and the icon set.
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    // Unminified on purpose: a core claim of this project is that anyone can
    // read the shipped code and verify nothing unredacted is transmitted.
    // Minified output would undercut that at exactly the moment it matters.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('./src/popup/popup.html', import.meta.url)),
        'service-worker': fileURLToPath(
          new URL('./src/background/service-worker.ts', import.meta.url),
        ),
        // The inference host. A separate extension page because ONNX Runtime
        // Web cannot run in an MV3 service worker at all.
        offscreen: fileURLToPath(new URL('./src/offscreen/offscreen.html', import.meta.url)),
        // The inference worker, as its own entry so it can be loaded by URL.
        // A module worker rather than a classic one, because the code it pulls
        // in is the same ES module tree everything else here uses.
        'inference-worker': fileURLToPath(
          new URL('./src/offscreen/inference-worker.ts', import.meta.url),
        ),
        // The scan record. Its own tab because it exists to be looked at — a
        // 348px popup cannot show a screenshot at a size where somebody can
        // check that their ID number really was covered.
        proof: fileURLToPath(new URL('./src/proof/proof.html', import.meta.url)),
        sent: fileURLToPath(new URL('./src/sent/sent.html', import.meta.url)),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});

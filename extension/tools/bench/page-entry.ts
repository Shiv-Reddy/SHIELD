/**
 * The page half of the benchmark: the extension's own DOM reader and executor,
 * exposed on `window` so a driver outside the browser can call them.
 *
 * The same modules the content script bundles, not a copy of them. A benchmark
 * that re-implemented the reader would measure the re-implementation, and the
 * two would drift the first time either changed.
 */

import { extractDomMap } from '../../src/content/dom-map';
import { executeAction } from '../../src/content/executor';

declare global {
  interface Window {
    __shieldBench?: {
      extract: typeof extractDomMap;
      execute: typeof executeAction;
    };
  }
}

window.__shieldBench = { extract: extractDomMap, execute: executeAction };

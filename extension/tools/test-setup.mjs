/**
 * Test entry hook. Registers the resolver above before any test module loads.
 *
 * Used as `node --import ./tools/test-setup.mjs --test tests/`.
 */

import { register } from 'node:module';

register('./test-resolver.mjs', import.meta.url);

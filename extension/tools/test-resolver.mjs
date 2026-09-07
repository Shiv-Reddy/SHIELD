/**
 * Resolve extensionless relative imports to their .ts files.
 *
 * The source uses bundler-style imports without extensions, which Vite resolves
 * and Node's ESM loader does not. The alternative was rewriting 50 import
 * statements across 19 files so that a test runner could read them, which is
 * the tail wagging the dog: the production build is the thing that must be
 * right, and it already is.
 *
 * So the adaptation lives here, in test infrastructure, rather than in the code
 * under test. Nothing in src/ knows this file exists.
 */

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !HAS_EXTENSION.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Fall through to the default resolver, so a genuinely missing module
      // still reports itself as missing rather than as a .ts that isn't there.
    }
  }

  return next(specifier, context);
}

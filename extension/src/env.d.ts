/**
 * Build-time constants injected by Vite (see vite.config.ts).
 *
 * `__SHIELD_BUILD__` exists so that "which build is actually running?" is a
 * question with a one-glance answer. Diagnosing a stale extension by comparing
 * log line numbers wastes far more time than stamping the build does.
 */
declare const __SHIELD_BUILD__: string;

/**
 * Whether this is a development build.
 *
 * `false` unless the build was started with SHIELD_DEV=1. It gates the
 * element-map export, which writes real field values to a file — a capability
 * that has no business existing in an extension somebody installed, and which
 * is therefore compiled out rather than merely hidden behind a setting.
 */
declare const __SHIELD_DEV__: boolean;

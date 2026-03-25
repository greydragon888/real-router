/**
 * Subpath export for @real-router/validation-plugin.
 *
 * Provides access to router internals so the plugin can install
 * ctx.validator and run retrospective validation at registration time.
 */

export type { RouterValidator } from "./types/RouterValidator";

export { getInternals } from "./internals";

export type { RouterInternals } from "./internals";

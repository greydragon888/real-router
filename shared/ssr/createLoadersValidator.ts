import { ALL_SSR_MODES } from "./types.js";

import type { SsrMode } from "./types.js";

export function createLoadersValidator(
  errorPrefix: string,
  allowedModes: readonly SsrMode[] = ALL_SSR_MODES,
) {
  return function validateLoaders(loaders: unknown): void {
    if (
      loaders === null ||
      typeof loaders !== "object" ||
      Array.isArray(loaders)
    ) {
      throw new TypeError(`${errorPrefix} loaders must be a non-null object`);
    }

    for (const [route, entry] of Object.entries(
      loaders as Record<string, unknown>,
    )) {
      if (typeof entry === "function") continue;

      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(
          `${errorPrefix} entry for route "${route}" must be a function or { ssr?, loader? } object`,
        );
      }

      for (const key of Object.keys(entry as Record<string, unknown>)) {
        if (key !== "ssr" && key !== "loader") {
          throw new TypeError(
            `${errorPrefix} unexpected key "${key}" in route "${route}" config`,
          );
        }
      }

      const obj = entry as { ssr?: unknown; loader?: unknown };

      if (obj.loader !== undefined && typeof obj.loader !== "function") {
        throw new TypeError(
          `${errorPrefix} loader for route "${route}" must be a function`,
        );
      }

      if (obj.ssr !== undefined) {
        const ssr = obj.ssr;

        if (typeof ssr === "function" || typeof ssr === "boolean") {
          continue;
        }

        if (typeof ssr === "string") {
          if (!(allowedModes as readonly string[]).includes(ssr)) {
            throw new TypeError(
              `${errorPrefix} mode "${ssr}" is not allowed for route "${route}". Allowed: ${allowedModes.join(", ")}`,
            );
          }
          continue;
        }

        throw new TypeError(
          `${errorPrefix} ssr for route "${route}" must be SsrMode string, boolean, or (state) => SsrMode`,
        );
      }
    }
  };
}

import { ALL_SSR_MODES } from "./types.js";

import type { SsrMode } from "./types.js";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — they answer "what is on this object" for a value this module
 * did not build. Read off the live global they can be re-pointed after boot, and
 * `shared/` is the half where that fails OPEN: measured in `browser-env`, a
 * re-pointed `getPrototypeOf` admits a `Date` into `state.params` and a
 * re-pointed `keys` skips option validation entirely.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it (#1798).
 */
const objectKeys = Object.keys;
const objectEntries = Object.entries;

/**
 * The `ssr` half of one entry. Split out for the same reason as
 * {@link validateEntry} — the three shapes `ssr` accepts (string, boolean,
 * resolver) each need their own branch, and inlining them put
 * `validateLoaders` at a cognitive complexity of 27 against a limit of 15.
 */
function validateSsr(
  route: string,
  ssr: unknown,
  errorPrefix: string,
  allowedModes: readonly SsrMode[],
): void {
  if (typeof ssr === "function" || typeof ssr === "boolean") {
    return;
  }

  if (typeof ssr === "string") {
    if (!(allowedModes as readonly string[]).includes(ssr)) {
      throw new TypeError(
        `${errorPrefix} mode "${ssr}" is not allowed for route "${route}". Allowed: ${allowedModes.join(", ")}`,
      );
    }

    return;
  }

  throw new TypeError(
    `${errorPrefix} ssr for route "${route}" must be SsrMode string, boolean, or (state) => SsrMode`,
  );
}

/** One `loaders` entry: either a bare loader function or a `{ ssr?, loader? }` object. */
function validateEntry(
  route: string,
  entry: unknown,
  errorPrefix: string,
  allowedModes: readonly SsrMode[],
): void {
  if (typeof entry === "function") {
    return;
  }

  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError(
      `${errorPrefix} entry for route "${route}" must be a function or { ssr?, loader? } object`,
    );
  }

  for (const key of objectKeys(entry)) {
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
    validateSsr(route, obj.ssr, errorPrefix, allowedModes);
  }
}

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

    for (const [route, entry] of objectEntries(
      loaders as Record<string, unknown>,
    )) {
      validateEntry(route, entry, errorPrefix, allowedModes);
    }
  };
}

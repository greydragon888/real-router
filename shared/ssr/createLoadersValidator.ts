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
const hasOwn = Object.hasOwn;

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
    // ⚑ "a resolver returning an SsrMode string", not "(state) => SsrMode"
    // (#1918). The short spelling reads as if the resolver may return whatever
    // the static slot accepts — including a boolean, which it may not, and
    // which `resolveMode` refuses at call time.
    `${errorPrefix} ssr for route "${route}" must be an SsrMode string, a boolean, or a resolver returning an SsrMode string`,
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

  // ⚑ Own keys, matching what `compile` consumes (#1835). The loop above
  // enumerates own keys, so an inherited `loader` is never an "unexpected key";
  // reading it with a member access here would type-check a value the compiler
  // must not use, and the two halves have to ask the same question.
  const loader = hasOwn(obj, "loader") ? obj.loader : undefined;
  const ssr = hasOwn(obj, "ssr") ? obj.ssr : undefined;

  if (loader !== undefined && typeof loader !== "function") {
    throw new TypeError(
      `${errorPrefix} loader for route "${route}" must be a function`,
    );
  }

  if (ssr !== undefined) {
    validateSsr(route, ssr, errorPrefix, allowedModes);
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

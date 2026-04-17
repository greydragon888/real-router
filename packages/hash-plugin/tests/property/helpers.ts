// packages/hash-plugin/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { createMockedBrowser } from "../helpers/testUtils";

import type { Router, Route } from "@real-router/core";

// =============================================================================
// Route Fixture
// =============================================================================

export const ROUTES: Route[] = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "list", path: "/list" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

// =============================================================================
// numRuns Constants
// =============================================================================

export const NUM_RUNS = {
  standard: 200,
  thorough: 500,
} as const;

// =============================================================================
// Arbitraries
// =============================================================================

// Prefix must be URL-safe and bounded by safeHashPrefixRule — no '/', '#',
// '?', control chars, and no characters that URL() encodes differently when
// they appear inside the fragment. We stick to RFC 3986 unreserved + a few
// sub-delims that survive URL parsing identity (ASCII-only, no emoji risk).
const PREFIX_CHAR_LIST: readonly string[] = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "!",
  "~",
  ".",
  "@",
  "+",
  "_",
  "-",
];

export const arbHashPrefix: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("", "!", "~", "@", ".", "+", "!!"),
  fc
    .array(fc.constantFrom(...PREFIX_CHAR_LIST), {
      minLength: 0,
      maxLength: 4,
    })
    .map((chars) => chars.join("")),
);

export const arbRegexSpecialPrefix = fc.constantFrom(
  ".",
  "+",
  "*",
  "\\",
  "[",
  "]",
  "{",
  "}",
  "(",
  ")",
  "|",
  "^",
  "$",
  "-",
);

export const arbSimpleRouteName = fc.constantFrom(
  "home",
  "users.list",
  "index",
);

export const arbParamValue = fc.constantFrom(
  "1",
  "42",
  "abc",
  "hello",
  "world",
  "123",
);

// --- URL-unsafe character params ---

export const arbUnsafeIdParam: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

// --- Base path (already-normalized form used by invariant tests that compare
// against the built URL verbatim). For normalization edge cases see
// `arbRawBase` below. ---

export const arbBase = fc.constantFrom("", "/app", "/my/base", "/a/b/c");

// Non-normalized base values — these exercise normalizeBase but must not be
// compared verbatim to the built URL because the plugin canonicalises them.
export const arbRawBase = fc.constantFrom(
  "",
  "/app",
  "app",
  "/app/",
  "//app//",
  "/a/b/c/",
);

// --- Multi-key string params (for arbitrary query roundtrip) ---

// Forbidden keys: conflict with route config fixture params, or collide with
// Object.prototype properties that leak through `params[key]` lookups.
const FORBIDDEN_PARAM_KEYS = new Set([
  "id",
  "name",
  "params",
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__proto__",
]);

export const arbStringParams: fc.Arbitrary<Record<string, string>> =
  fc.dictionary(
    fc
      .string({ minLength: 1, maxLength: 8 })
      .filter((s) => /^[a-z][a-z0-9_]*$/i.test(s))
      .filter((s) => !FORBIDDEN_PARAM_KEYS.has(s)),
    fc.string({ minLength: 1, maxLength: 20 }),
    { minKeys: 1, maxKeys: 4 },
  );

// =============================================================================
// Router Factory Helpers
// =============================================================================

export function createHashRouter(hashPrefix: string, base = ""): Router {
  const router = createRouter(ROUTES, {
    defaultRoute: "home",
    queryParamsMode: "default",
  });

  const mockedBrowser = createMockedBrowser(() => undefined, hashPrefix);

  router.usePlugin(hashPluginFactory({ hashPrefix, base }, mockedBrowser));

  return router;
}

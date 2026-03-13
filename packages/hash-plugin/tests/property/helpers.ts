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
  standard: 50,
  thorough: 100,
} as const;

// =============================================================================
// Arbitraries
// =============================================================================

export const arbHashPrefix = fc.constantFrom("", "!", "~");

export const arbRegexSpecialPrefix = fc.constantFrom(".", "+", "?", "*");

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

// --- Base path ---

export const arbBase = fc.constantFrom("", "/app", "/my/base");

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

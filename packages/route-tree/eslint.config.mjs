// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,

  // White-box guardrail (mirrors packages/core + packages/path-matcher; whitebox
  // audit via the /whitebox-audit skill). FUNCTIONAL tests must exercise the PUBLIC
  // API — the `route-tree` package index (`createRouteTree`, `createMatcher`,
  // `getSegmentsByName`, `routeTreeToDefinitions`, `validateRoute`, + the public
  // types) — never a relative `src/*` path. Reaching an internal
  // (`validation/routes` → `validateRoutePath`, `builder/*`, `operations/*`) directly
  // lets a mutant be killed without strengthening the PUBLIC contract, which hides
  // dead / publicly-unreachable code from the 100% coverage gate. Forcing the public
  // surface makes that dead code SHOW UP as an uncovered branch instead of being
  // silently exercised from the inside.
  //
  // Scope is deliberately `tests/functional/**/*.test.ts` ONLY. Other suites keep
  // their legitimate relationship with internals and are NOT constrained:
  //   - `tests/property/**` — generative tests of internal seams (the gate↔backstop
  //     parity property imports `validateRoutePath` + `createRouteTree` from src by
  //     design; this is the Stryker-invisible coverage the functional tests lean on).
  //   - `tests/stress/**` — scale/throughput guards over the builder / validator.
  //   - `tests/__mocks__/**` — fixture infrastructure (`createMockRouteNode`, still
  //     used by validation-route-batch.test.ts for a hand-built RouteTree parent).
  //   - `tests/functional/operations/helpers.ts` — a NON-`.test.ts` fixture
  //     (`matchPath` / `matchSegments` wire `createMatcher` into a test-ready matcher);
  //     it already imports only public symbols from `route-tree`.
  //
  // The audit result (see run report): `validateRoutePath` — the one truly-internal
  // symbol a test reached directly — is FULLY reachable through the public
  // `validateRoute` (which delegates to it verbatim, same TypeError messages),
  // including the `~`-under-parameterized-parent branch via a REAL `createRouteTree`
  // param root. So `validation-routes.test.ts` was migrated wholesale; no branch was
  // publicly unreachable. The allowlist is therefore EMPTY — every functional test
  // exercises the public API. If a future branch is GENUINELY unreachable through the
  // public surface, add an `ignores: [...]` entry here with a one-line justification.
  {
    files: ["tests/functional/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src", "**/src/**"],
              message:
                "White-box: functional tests must exercise the public API (the `route-tree` package index — `createRouteTree`, `createMatcher`, `getSegmentsByName`, `routeTreeToDefinitions`, `validateRoute`, + public types), not internal src/* paths. A public symbol imported via a src/* path (`../../src/builder/createRouteTree`, `../../src/createMatcher`, `../../src/types`) → import it from `route-tree` instead. A test that must exercise an internal pure function directly belongs in tests/property/ (exempt). If a branch is genuinely unreachable via the public surface, add a documented KEEP-narrow exception (an `ignores:` entry) to the allowlist in packages/route-tree/eslint.config.mjs. See packages/core/eslint.config.mjs + packages/path-matcher/eslint.config.mjs.",
            },
          ],
        },
      ],
    },
  },
];

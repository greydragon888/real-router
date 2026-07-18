// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Conflicts with @typescript-eslint/no-floating-promises which requires `void` prefix
      "sonarjs/void-use": "off",
      // Tests use defensive optional chaining even when types guarantee non-null
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Tests extensively use expect() inside try/catch blocks (468 occurrences)
      "vitest/no-conditional-expect": "off",
    },
  },

  // White-box guardrail (audit 2026-06-23, .claude/whitebox-test-audit-2026-06-23.md):
  // FUNCTIONAL tests must exercise the PUBLIC API (@real-router/core, /api,
  // /utils, /validation) — never a relative `src/*` path. This structurally
  // prevents the mutation-shortcut regression class where a survived mutant was
  // killed by calling an internal function directly instead of strengthening the
  // public contract (which hides dead/unreachable code from the coverage gate).
  //
  // Scope is deliberately `tests/functional/**/*.test.ts` ONLY. Other suites have
  // a legitimately different relationship with internals and are NOT constrained:
  //   - `tests/property/**` — generative tests of internal PURE functions
  //     (`nameToIDs`, etc.) are their whole purpose; this is the Stryker-invisible
  //     coverage the functional Stryker-mirrors lean on. They import from src by
  //     design.
  //   - `tests/stress/**` — use documented performance/leak seams (e.g.
  //     `getInternals().getLifecycleFactories()`, the RouterInternals accessor
  //     guarded by Router.ts's v8-ignore).
  //   - `tests/helpers/**` — fixture infrastructure (`setStateMetaParams` builds
  //     meta-carrying State fixtures; there is no public "set meta" API).
  //   - `tests/benchmarks/**` — measure pure functions directly.
  // Sanctioned-seam note: `getInternals` must come from `@real-router/core/validation`
  // (the public seam), never `../../src/internals` — applies everywhere, enforced
  // by code review (property/stress already migrated).
  //
  // The allowlist is EMPTY — every functional test exercises the public API.
  // The 7 once-suspected "unreachable" branches were all resolved: 5 were in fact
  // reachable publicly (matchSourceTrailingSlash via forwardTo, subscribe-leave's
  // L47 via a sync-listener stop(), transitionPath FAST PATH 1/3 via start() +
  // shouldUpdateNode(makeState), shouldUpdateNode itself), and the rest were
  // removed as dead defensive cruft from src (state `?? ""`, freezeStateInPlace
  // `!state`, reverseArray's order, assertLoggerConfig `config === null`).
  // If a future branch is GENUINELY unreachable through the public surface, add an
  // `ignores: [...]` entry here with a one-line justification of why.
  {
    files: ["tests/functional/**/*.test.ts"],
    // TEMPORARY blackbox exemptions (fsm + event-emitter + logger → core/src/foundation).
    ignores: [
      // Folded-in foundation primitives keep their own functional suites, which
      // import the module they OWN via a relative ../../../src/foundation/* path
      // (frozen fsm copy + dissolved event-emitter + dissolved logger — the
      // per-router RouterLogger, #724). To be rewritten onto a public surface
      // later — see IMPLEMENTATION_NOTES "fsm + event-emitter → core/src/foundation".
      "tests/functional/foundation/**/*.test.ts",
      // Structural core-invariant test (#1169): it asserts the FSM engine core
      // ACTUALLY builds on (src/foundation/fsm) exposes no forceState bypass, so
      // it must import FSM from src — the frozen standalone @real-router/fsm copy
      // would give this lock no mutation-discriminating power over the live code.
      "tests/functional/fsm-state-authority.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src", "**/src/**"],
              message:
                "White-box: functional tests must exercise the public API (@real-router/core, /api, /utils, /validation), not internal src/* paths. If a branch is genuinely unreachable via the public surface, add a documented KEEP-narrow exception to the eslint allowlist in packages/core/eslint.config.mjs. See .claude/whitebox-test-audit-2026-06-23.md.",
            },
          ],
        },
      ],
    },
  },

  // ── Engine layer-boundary + white-box tiers (ported from the former
  //    packages/engine/eslint.config.mjs when the routing engine folded into
  //    core/src/engine, #1510). Globs re-scoped: src/ → src/engine/, tests/ →
  //    tests/engine/. §4 layer-import patterns match RELATIVE internal imports
  //    (unchanged by the fold, so no src/engine prefix); §5 whitebox patterns
  //    match the tests' src/engine paths, so they carry the src/engine/ prefix —
  //    §5a's facade tier now ALLOWS the src/engine barrel (functional tests can no
  //    longer import the standalone `engine` package) while still banning deeper.

  // §4 — search-params layer is a leaf: no sibling layer / engine root.
  {
    files: ["src/engine/search-params/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/path-matcher",
                "**/path-matcher/**",
                "**/createMatcher",
                "**/builder/**",
                "**/operations/**",
                "**/validation/**",
              ],
              message:
                "Layer boundary (§4): the search-params layer is a self-contained leaf — it must not import the path-matcher layer or the engine root. Query reaches the matcher via the DI seam, not a direct import.",
            },
          ],
        },
      ],
    },
  },
  // §4 — path-matcher layer is a leaf: no query layer / engine root.
  {
    files: ["src/engine/path-matcher/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/search-params",
                "**/search-params/**",
                "**/createMatcher",
                "**/builder/**",
                "**/operations/**",
                "**/validation/**",
              ],
              message:
                "Layer boundary (§4): the path-matcher layer is a self-contained leaf — search-params is wired via the DI seam, never imported directly, and the engine root must not be reached upward.",
            },
          ],
        },
      ],
    },
  },
  // §4 — route-tree root imports a layer ONLY through its barrel.
  {
    files: [
      "src/engine/*.ts",
      "src/engine/builder/**/*.ts",
      "src/engine/operations/**/*.ts",
      "src/engine/validation/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/path-matcher/*",
                "**/path-matcher/**",
                "**/search-params/*",
                "**/search-params/**",
              ],
              message:
                "Layer boundary (§4): import a layer only through its barrel (./path-matcher, ../search-params), never deep into its internals.",
            },
          ],
        },
      ],
    },
  },
  // §5 — facade tier: engine functional tests exercise the engine public API
  // (the src/engine barrel), never deeper internals.
  {
    files: ["tests/engine/functional/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/engine/*", "**/src/engine/**"],
              message:
                "White-box (facade tier, §5): functional tests must exercise the engine public API via the src/engine barrel (createRouteTree, createMatcher, getSegmentsByName, routeTreeToDefinitions, validateRoute, + public types), not internal src/engine/* paths. A test of an internal pure function belongs in tests/engine/property/ (exempt).",
            },
          ],
        },
      ],
    },
  },
  // §5 — path-matcher layer unit tier: import the layer BARREL, never internals
  // or another layer. KEEP-narrow allowlist (documented in-file).
  {
    files: ["tests/engine/unit/path-matcher/**/*.test.ts"],
    ignores: [
      "tests/engine/unit/path-matcher/createSegmentNode.test.ts",
      "tests/engine/unit/path-matcher/percentEncoding.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/src/engine/path-matcher/*",
                "**/src/engine/path-matcher/**",
                "**/src/engine/search-params/**",
                "**/src/engine/builder/**",
                "**/src/engine/operations/**",
                "**/src/engine/validation/**",
                "**/src/engine/index",
                "**/src/engine/types",
                "**/src/engine/createMatcher",
              ],
              message:
                "White-box (path-matcher layer tier, §5): unit tests import the path-matcher layer BARREL (../../../src/engine/path-matcher), never its internal files or another layer. A KEEP-narrow exception goes in the allowlist; a test of a genuinely internal pure function belongs in tests/engine/property/path-matcher/ (exempt).",
            },
          ],
        },
      ],
    },
  },
  // §5 — search-params layer unit tier: import the layer BARREL. KEEP-narrow
  // allowlist (documented in-file).
  {
    files: ["tests/engine/unit/search-params/**/*.test.ts"],
    ignores: ["tests/engine/unit/search-params/makeOptions.singleton.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/src/engine/search-params/*",
                "**/src/engine/search-params/**",
                "**/src/engine/path-matcher/**",
                "**/src/engine/builder/**",
                "**/src/engine/operations/**",
                "**/src/engine/validation/**",
                "**/src/engine/index",
                "**/src/engine/types",
                "**/src/engine/createMatcher",
              ],
              message:
                "White-box (search-params layer tier, §5): unit tests import the search-params layer BARREL (../../../src/engine/search-params), never its internal files or another layer. A KEEP-narrow exception goes in the allowlist; a test of a genuinely internal pure function belongs in tests/engine/property/search-params/ (exempt).",
            },
          ],
        },
      ],
    },
  },
];

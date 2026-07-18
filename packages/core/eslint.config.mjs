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
];

// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,

  // White-box guardrail (mirrors packages/core/eslint.config.mjs +
  // packages/path-matcher/eslint.config.mjs; whitebox-audit 2026-07-17). FUNCTIONAL
  // tests must exercise the PUBLIC API — the `type-guards` package index (`isString`,
  // `isParams`, `isParamsStrict`, `isRouteName`, `isState`, `isStateStrict`,
  // `isNavigationOptions`, `isObjKey`, `isBoolean`, `isPrimitiveValue`,
  // `validateRouteName`, `validateState`, `getTypeDescription`) — never a relative
  // `src/*` path. Reaching an internal directly (`isSerializable`/`visitContainer` and
  // the other params slow-path helpers, `isValidParamValueStrict`, `isRequiredFields`
  // in internal/meta-fields, or the `internal/router-error` constants
  // `FULL_ROUTE_PATTERN`/`HAS_NON_WHITESPACE`/`MAX_ROUTE_NAME_LENGTH`/`createRouterError`)
  // lets a mutant be killed without strengthening the PUBLIC contract, which hides
  // dead / publicly-unreachable code from the 100% coverage gate. Forcing the public
  // surface makes that dead code SHOW UP as an uncovered branch instead of being
  // silently exercised from the inside.
  //
  // Scope is deliberately `tests/functional/**/*.test.ts` ONLY. The other suites keep
  // their legitimate relationship with internals and are NOT constrained:
  //   - `tests/property/**` — generative tests. Internal PURE functions (the
  //     `isSerializable` work-stack walk, the strict-value predicate) are fair game
  //     here by design; they import from src when a public entry cannot reach the
  //     invariant. (Today they all happen to go through the public surface too — that
  //     is a bonus, not a constraint on future property tests.)
  //   - `tests/stress/**` — scale / throughput / no-overflow guards over untrusted
  //     input (deep nesting, ReDoS) that legitimately probe internal seams.
  //   - `tests/property/helpers.ts` — fast-check arbitrary infrastructure.
  //
  // A functional test of a genuinely internal pure function that cannot be meaningfully
  // reached through the public surface belongs in `tests/property/` (exempt) — or, if a
  // branch is GENUINELY unreachable through the public API, add an `ignores: [...]`
  // entry here with a one-line justification.
  //
  // The allowlist is EMPTY — and started empty. The 2026-07-17 whitebox audit found
  // every functional test already imports from `type-guards` (the public index) and
  // that the functional suite ALONE gives 100% statement/branch/function/line coverage
  // of every src module (incl. `internal/*`), so there is no publicly-unreachable
  // branch to exempt, no dead code to remove, and no property-only line needing a
  // v8-ignore. This guardrail LOCKS IN that already-honest state; it does not repair a
  // regressed one. If a future branch becomes genuinely unreachable via the public
  // surface, add a documented `ignores: [...]` entry here.
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
                "White-box: functional tests must exercise the public API (the `type-guards` package index — `isString`, `isParams`, `isRouteName`, `isState`, `validateState`, `getTypeDescription`, …), not internal src/* paths. A public symbol imported via a src/* path (`../../src/guards`, `../../src/index`) → import it from `type-guards` instead. A test that must exercise an internal pure function directly (the `isSerializable` walk, `isValidParamValueStrict`, the `router-error` constants) belongs in tests/property/ (exempt). If a branch is genuinely unreachable via the public surface, add a documented KEEP-narrow exception (an `ignores:` entry) to the allowlist in packages/type-guards/eslint.config.mjs. See packages/core/eslint.config.mjs + packages/path-matcher/eslint.config.mjs.",
            },
          ],
        },
      ],
    },
  },
];

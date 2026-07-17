// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,

  // White-box guardrail (mirrors packages/core + packages/path-matcher; the
  // whitebox-audit doctrine, .claude/whitebox-test-audit-2026-06-23.md). UNIT
  // tests must exercise the PUBLIC API — the `search-params` package index
  // (`parse`, `parseQuery`, `build`, `DEFAULT_QUERY_PARAMS`) — never a relative
  // `src/*` path. Reaching an internal (`decode`/`decodeValue`, `encode`/
  // `encodeValue`/`makeOptions`, `getSearch`/`safeEncode`, the per-format
  // `strategies/*` objects, `resolveStrategies`) directly lets a mutant be killed
  // without strengthening the PUBLIC contract, which hides dead / publicly-
  // unreachable code from the 100% coverage gate. Forcing the public surface makes
  // that dead code SHOW UP as an uncovered branch instead of being silently
  // exercised from the inside.
  //
  // Scope is deliberately `tests/functional/**/*.test.ts` ONLY (search-params'
  // unit-like dir). Other suites keep their legitimate relationship with internals
  // and are NOT constrained:
  //   - `tests/property/**` — generative tests; they still import the PUBLIC
  //     `build`/`parse` from the barrel by design (round-trip invariants).
  //   - `tests/stress/**` — scale/throughput guards over `parse`/`build`.
  //
  // A unit test of a genuinely internal pure function that cannot be meaningfully
  // reached through the public surface belongs in `tests/property/` (exempt) — or,
  // if a branch is GENUINELY unreachable through the public API, add an
  // `ignores: [...]` entry here with a one-line justification. The allowlist starts
  // EMPTY — surfacing every `src/*` import (and the dead code it may hide) is the
  // whole point.
  {
    files: ["tests/functional/**/*.test.ts"],
    // KEEP-narrow white-box exceptions (the allowlist). Every OTHER functional
    // test exercises the public API; this one legitimately cannot, and documents
    // WHY in its header:
    //   - makeOptions.singleton.test.ts — the allocation-free cached-singleton
    //     identity of DEFAULT_OPTIONS (a hot-path MEMORY/PERF invariant; the
    //     premise of parse-scale.stress.ts). The resolved default VALUES and the
    //     partial-override precedence ARE public and live in search-params.test.ts
    //     ("option resolution"); only the object-identity — never handed back
    //     through parse/build, so publicly indistinguishable from a per-call
    //     reallocation — is pinned directly here. Twin of path-matcher's
    //     createSegmentNode.test.ts.
    // decode / encode / utils / strategies were all migrated to the public API and
    // are deliberately NOT here.
    ignores: ["tests/functional/makeOptions.singleton.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src", "**/src/**"],
              message:
                "White-box: unit tests must exercise the public API (the `search-params` package index — `parse`, `parseQuery`, `build`, `DEFAULT_QUERY_PARAMS`), not internal src/* paths. A public symbol imported via a src/* path (`../../src`) → import it from `search-params` instead. A test that must exercise an internal pure function directly belongs in tests/property/ (exempt). If a branch is genuinely unreachable via the public surface, add a documented KEEP-narrow exception (an `ignores:` entry) to the allowlist in packages/search-params/eslint.config.mjs. See packages/path-matcher/eslint.config.mjs + .claude/whitebox-test-audit-2026-06-23.md.",
            },
          ],
        },
      ],
    },
  },
];

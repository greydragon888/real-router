// @ts-check

import eslintConfig from "../../eslint.config.mjs";

export default [
  ...eslintConfig,

  // White-box guardrail (mirrors packages/core/eslint.config.mjs; whitebox-test
  // audit .claude/whitebox-test-audit-2026-06-23.md). UNIT tests must exercise the
  // PUBLIC API — the `path-matcher` package index (`SegmentMatcher`, `buildParamMeta`)
  // — never a relative `src/*` path. Reaching an internal (`parseSegment`, `encoding`,
  // `constraint-grammar`, `pathUtils`/`createSegmentNode`, `percentEncoding`, the
  // `registration/*` internals) directly lets a mutant be killed without strengthening
  // the PUBLIC contract, which hides dead / publicly-unreachable code from the 100%
  // coverage gate. Forcing the public surface makes that dead code SHOW UP as an
  // uncovered branch instead of being silently exercised from the inside.
  //
  // Scope is deliberately `tests/unit/**/*.test.ts` ONLY. Other suites keep their
  // legitimate relationship with internals and are NOT constrained:
  //   - `tests/property/**` — generative tests of internal PURE functions
  //     (`parseSegment`, `splitPathSegments`, the encoders) are their whole purpose;
  //     they import from src by design.
  //   - `tests/stress/**` — scale/throughput/leak guards over internal seams.
  //   - `tests/helpers/**` — fixture infrastructure (`createTestMatcher`, `buildTree`
  //     wire `SegmentMatcher` into a test-ready matcher).
  //
  // A unit test of a genuinely internal pure function that cannot be meaningfully
  // reached through the public surface belongs in `tests/property/` (exempt) — or, if
  // a branch is GENUINELY unreachable through the public API, add an `ignores: [...]`
  // entry here with a one-line justification. The allowlist starts EMPTY — surfacing
  // every `src/*` import (and the dead code it may hide) is the whole point.
  {
    files: ["tests/unit/**/*.test.ts"],
    // TODO(whitebox-migration): these three still import internal `src/*` and are
    // temporarily exempt — migrate each to the public API (like `parseSegment` /
    // `buildParamMeta` / `constraint-grammar`, already done) then delete it here.
    //   SegmentMatcher: `createSegmentNode` + `EMPTY_STATIC_CHILDREN` fixtures;
    //   encoding / percentEncoding: internal encoder / percent-validation helpers.
    ignores: [
      "tests/unit/SegmentMatcher.test.ts",
      "tests/unit/encoding.test.ts",
      "tests/unit/percentEncoding.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src", "**/src/**"],
              message:
                "White-box: unit tests must exercise the public API (the `path-matcher` package index — `SegmentMatcher`, `buildParamMeta`), not internal src/* paths. A public symbol imported via a src/* path (`../../src/buildParamMeta`, `../../src/SegmentMatcher`, `../../src/types`) → import it from `path-matcher` instead. A test that must exercise an internal pure function directly belongs in tests/property/ (exempt). If a branch is genuinely unreachable via the public surface, add a documented KEEP-narrow exception (an `ignores:` entry) to the allowlist in packages/path-matcher/eslint.config.mjs. See packages/core/eslint.config.mjs + .claude/whitebox-test-audit-2026-06-23.md.",
            },
          ],
        },
      ],
    },
  },
];

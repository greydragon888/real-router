// @ts-check

import eslintConfig from "../../eslint.config.mjs";

// `engine` is the merged routing engine (engine-merge #1510): the former
// `route-tree` facade at the src root, with `path-matcher` and `search-params`
// folded in as internal LAYERS under `src/path-matcher/` and `src/search-params/`.
// Two lint concerns are enforced here:
//   §4 — layer boundaries: each lower layer is a self-contained leaf (path-matcher
//        never imports search-params — query is wired via the DI seam, not a direct
//        import); the route-tree root reaches a layer only through its barrel.
//   §5 — the three white-box test tiers (facade / path-matcher-layer /
//        search-params-layer), carried over from the pre-merge packages with their
//        documented KEEP-narrow allowlists.
export default [
  ...eslintConfig,

  // === §4 Layer boundaries ===

  // The search-params layer is a leaf: it must not reach the sibling layer or the
  // route-tree root. (Intra-layer `../` — e.g. strategies/index → ../types — is fine;
  // only the sibling layer + root modules are named here, so no false positive.)
  {
    files: ["src/search-params/**/*.ts"],
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

  // The path-matcher layer is a leaf: it must not import the query layer (the
  // zero-coupling DI invariant) or the route-tree root. (Intra-layer `../` —
  // registration/trie → ../buildParamMeta — is fine.)
  {
    files: ["src/path-matcher/**/*.ts"],
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

  // The route-tree root imports a layer ONLY through its barrel (./path-matcher,
  // ../search-params), never deep into layer internals.
  {
    files: [
      "src/*.ts",
      "src/builder/**/*.ts",
      "src/operations/**/*.ts",
      "src/validation/**/*.ts",
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

  // === §5 White-box test guardrails (3 tiers) ===

  // Tier 1 — facade: functional tests exercise the ENGINE public API (import from
  // "engine"), never a src/* path. Allowlist EMPTY (inherited from route-tree).
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
                'White-box (facade tier, §5): functional tests must exercise the public API (import from "engine": createRouteTree, createMatcher, getSegmentsByName, routeTreeToDefinitions, validateRoute, + public types), not internal src/* paths. A test of an internal pure function belongs in tests/property/ (exempt).',
            },
          ],
        },
      ],
    },
  },

  // Tier 2a — path-matcher layer: unit tests import the layer BARREL
  // (../../../src/path-matcher), never deeper internals or another layer.
  // KEEP-narrow allowlist (import layer internals directly, documented in-file):
  //   - createSegmentNode.test.ts — trie-node MEMORY / hidden-class invariants
  //   - percentEncoding.test.ts — a fast-reject optimisation backstopped by decode
  {
    files: ["tests/unit/path-matcher/**/*.test.ts"],
    ignores: [
      "tests/unit/path-matcher/createSegmentNode.test.ts",
      "tests/unit/path-matcher/percentEncoding.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/src/path-matcher/*",
                "**/src/path-matcher/**",
                "**/src/search-params/**",
                "**/src/builder/**",
                "**/src/operations/**",
                "**/src/validation/**",
                "**/src/index",
                "**/src/types",
                "**/src/createMatcher",
              ],
              message:
                "White-box (path-matcher layer tier, §5): unit tests import the path-matcher layer BARREL (../../../src/path-matcher), never its internal files or another layer. Reaching inside kills mutants without strengthening the barrel contract. A KEEP-narrow exception goes in the allowlist; a test of a genuinely internal pure function belongs in tests/property/path-matcher/ (exempt).",
            },
          ],
        },
      ],
    },
  },

  // Tier 2b — search-params layer: unit tests import the layer BARREL
  // (../../../src/search-params). KEEP-narrow allowlist:
  //   - makeOptions.singleton.test.ts — cached-singleton identity of DEFAULT_OPTIONS
  {
    files: ["tests/unit/search-params/**/*.test.ts"],
    ignores: ["tests/unit/search-params/makeOptions.singleton.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/src/search-params/*",
                "**/src/search-params/**",
                "**/src/path-matcher/**",
                "**/src/builder/**",
                "**/src/operations/**",
                "**/src/validation/**",
                "**/src/index",
                "**/src/types",
                "**/src/createMatcher",
              ],
              message:
                "White-box (search-params layer tier, §5): unit tests import the search-params layer BARREL (../../../src/search-params), never its internal files or another layer. A KEEP-narrow exception goes in the allowlist; a test of a genuinely internal pure function belongs in tests/property/search-params/ (exempt).",
            },
          ],
        },
      ],
    },
  },
];

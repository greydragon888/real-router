const ignoreCore = ["@real-router/core"];

const esm = (name, limit, ignore) => ({
  name: `@real-router/${name} (ESM)`,
  path: `packages/${name}/dist/esm/index.mjs`,
  limit,
  ...(ignore && { ignore }),
});

export default [
  // ── Core ──────────────────────────────────────────────────────────
  // ⚠ A limit here catches a JUMP, not an absolute weight, and nothing gates on
  // it — `ci.yml`'s Bundle Size job swallows the non-zero exit and only posts a
  // comment ("bundle-size is not in the `ci` gate"). So an exceeded limit is
  // visible on a PR and nowhere else, which is how core sat 174 B over this one
  // for five days. Raising a number here is a decision that belongs in the
  // commit message, with the measurement that prompted it.
  esm("core", "28 kB"),
  {
    name: "@real-router/core/api (ESM)",
    path: "packages/core/dist/esm/api.mjs",
    limit: "34 kB",
    ignore: ignoreCore,
  },
  // ⚑ The two remaining runtime subpaths, because the entries above are exactly
  // where the chunking penalty is ZERO (#2210). Each of these files is a
  // handful of re-export bytes that pulls a whole shared chunk, so a consumer
  // taking one small symbol from core pays multiples of what the symbol costs —
  // and until these lines existed nothing measured it. Neither takes
  // `ignoreCore`: both import only relative chunks, so there is no external to
  // ignore. `./types` gets no entry — it ships no runtime.
  {
    name: "@real-router/core/utils (ESM)",
    path: "packages/core/dist/esm/utils.mjs",
    limit: "800 B",
  },
  {
    name: "@real-router/core/validation (ESM)",
    path: "packages/core/dist/esm/validation.mjs",
    limit: "3.5 kB",
  },

  // ── UI Bindings ───────────────────────────────────────────────────
  esm("react", "10 kB", ["react", "react-dom", ...ignoreCore]),
  esm("preact", "10 kB", [
    "preact",
    "preact/hooks",
    "preact/compat",
    ...ignoreCore,
  ]),
  esm("solid", "10 kB", [
    "solid-js",
    "solid-js/store",
    "solid-js/web",
    ...ignoreCore,
  ]),
  esm("vue", "10 kB", ["vue", ...ignoreCore]),
  {
    name: "@real-router/angular (FESM2022)",
    path: "packages/angular/dist/fesm2022/real-router-angular.mjs",
    limit: "12 kB",
    ignore: [
      "@angular/core",
      "@angular/common",
      ...ignoreCore,
      "@real-router/core/api",
    ],
  },
  // Note: @real-router/svelte uses svelte-package (individual files),
  // not a single ESM bundle — cannot be measured by size-limit/esbuild.
  esm("sources", "3.4 kB", ignoreCore),
  esm("rx", "1.5 kB", ignoreCore),

  // ── Plugins ───────────────────────────────────────────────────────
  esm("navigation-plugin", "4 kB", ignoreCore),
  esm("browser-plugin", "4 kB", ignoreCore),
  esm("hash-plugin", "4 kB", ignoreCore),
  esm("memory-plugin", "1 kB", ignoreCore),
  // ⚑ `ignoreCore` since #1852, which is what every sibling already had. This
  // was the one plugin importing core with `import type` ONLY, so its budget
  // measured the plugin alone by ACCIDENT rather than by configuration; the
  // ingestion primitive (`@real-router/core/utils`) is its first RUNTIME core
  // import, and core is a separate package the consumer already pays for.
  //
  // ⚠ The limit rises 1.6 → 1.8 kB, and the number moved in the direction that
  // looks wrong: measured, 1.66 kB WITHOUT `ignoreCore` and 1.74 kB WITH it.
  // Marking a dependency external does not shrink the bundle here — it replaces
  // ~80 B of inlined primitive with an `import … from "@real-router/core/utils"`
  // statement that brotli compresses less well. The config is still the correct
  // one (it is what every sibling uses, and the inlined form would double-count
  // code the consumer already has); the budget follows the config rather than
  // the other way round.
  esm("logger-plugin", "1.8 kB", ignoreCore),
  esm("persistent-params-plugin", "1.5 kB", ignoreCore),
  esm("lifecycle-plugin", "1 kB", ignoreCore),
  esm("preload-plugin", "1.5 kB", ignoreCore),
  esm("search-schema-plugin", "1.5 kB", ignoreCore),
  esm("validation-plugin", "10 kB", ignoreCore),
  esm("ssr-data-plugin", "2.5 kB", ignoreCore),
  esm("rsc-server-plugin", "2.5 kB", ignoreCore),

  // ── Utilities ─────────────────────────────────────────────────────
  esm("route-utils", "1 kB"),
  esm("ssr-utils", "2 kB", ignoreCore),
];

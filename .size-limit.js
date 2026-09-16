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
  //
  // ⚠ Every number below is brotli size as measured by ROLLDOWN, the bundler
  // `@size-limit/preset-small-lib` ships since size-limit 14. The preset
  // carried esbuild through 13, and the two disagree by up to ~700 B on the
  // same input, so a limit compared against a pre-14 number compares two
  // instruments. Declaring a second bundler plugin alongside the preset does
  // NOT override it — both run, and manifest key order picks the winner.
  esm("core", "28 kB"),
  {
    name: "@real-router/core/api (ESM)",
    path: "packages/core/dist/esm/api.mjs",
    limit: "32.5 kB",
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
    limit: "900 B",
  },
  {
    name: "@real-router/core/validation (ESM)",
    path: "packages/core/dist/esm/validation.mjs",
    limit: "3.6 kB",
  },

  // ── UI Bindings ───────────────────────────────────────────────────
  esm("react", "9 kB", ["react", "react-dom", ...ignoreCore]),
  esm("preact", "8.9 kB", [
    "preact",
    "preact/hooks",
    "preact/compat",
    ...ignoreCore,
  ]),
  esm("solid", "8.7 kB", [
    "solid-js",
    "solid-js/store",
    "solid-js/web",
    ...ignoreCore,
  ]),
  esm("vue", "10 kB", ["vue", ...ignoreCore]),
  {
    name: "@real-router/angular (FESM2022)",
    path: "packages/angular/dist/fesm2022/real-router-angular.mjs",
    limit: "11 kB",
    ignore: [
      "@angular/core",
      "@angular/common",
      ...ignoreCore,
      "@real-router/core/api",
    ],
  },
  // Note: @real-router/svelte uses svelte-package (individual files),
  // not a single ESM bundle — cannot be measured by size-limit's bundler.
  esm("sources", "2.8 kB", ignoreCore),
  esm("rx", "1.5 kB", ignoreCore),

  // ── Plugins ───────────────────────────────────────────────────────
  esm("navigation-plugin", "4.2 kB", ignoreCore),
  esm("browser-plugin", "3.8 kB", ignoreCore),
  esm("hash-plugin", "3.8 kB", ignoreCore),
  esm("memory-plugin", "950 B", ignoreCore),
  // ⚑ `ignoreCore` since #1852, which is what every sibling already had. This
  // was the one plugin importing core with `import type` ONLY, so its budget
  // measured the plugin alone by ACCIDENT rather than by configuration; the
  // ingestion primitive (`@real-router/core/utils`) is its first RUNTIME core
  // import, and core is a separate package the consumer already pays for.
  esm("logger-plugin", "1.8 kB", ignoreCore),
  esm("persistent-params-plugin", "1.6 kB", ignoreCore),
  esm("lifecycle-plugin", "650 B", ignoreCore),
  esm("preload-plugin", "1.3 kB", ignoreCore),
  esm("search-schema-plugin", "1.5 kB", ignoreCore),
  esm("validation-plugin", "8.7 kB", ignoreCore),
  esm("ssr-data-plugin", "2.7 kB", ignoreCore),
  esm("rsc-server-plugin", "2.7 kB", ignoreCore),

  // ── Utilities ─────────────────────────────────────────────────────
  esm("route-utils", "950 B"),
  esm("ssr-utils", "1.6 kB", ignoreCore),
];

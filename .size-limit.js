const ignoreCore = ["@real-router/core"];

const esm = (name, limit, ignore) => ({
  name: `@real-router/${name} (ESM)`,
  path: `packages/${name}/dist/esm/index.mjs`,
  limit,
  ...(ignore && { ignore }),
});

export default [
  // ── Core ──────────────────────────────────────────────────────────
  esm("core", "20 kB"),
  {
    name: "@real-router/core/api (ESM)",
    path: "packages/core/dist/esm/api.mjs",
    limit: "20 kB",
    ignore: ignoreCore,
  },

  // ── UI Bindings ───────────────────────────────────────────────────
  esm("react", "6 kB", ["react", "react-dom", ...ignoreCore]),
  esm("preact", "6 kB", [
    "preact",
    "preact/hooks",
    "preact/compat",
    ...ignoreCore,
  ]),
  esm("solid", "6 kB", [
    "solid-js",
    "solid-js/store",
    "solid-js/web",
    ...ignoreCore,
  ]),
  esm("vue", "7 kB", ["vue", ...ignoreCore]),
  {
    name: "@real-router/angular (FESM2022)",
    path: "packages/angular/dist/fesm2022/real-router-angular.mjs",
    limit: "7.5 kB",
    ignore: [
      "@angular/core",
      "@angular/common",
      ...ignoreCore,
      "@real-router/core/api",
    ],
  },
  // Note: @real-router/svelte uses svelte-package (individual files),
  // not a single ESM bundle — cannot be measured by size-limit/esbuild.
  esm("sources", "2.5 kB", ignoreCore),
  esm("rx", "1.5 kB", ignoreCore),

  // ── Plugins ───────────────────────────────────────────────────────
  esm("navigation-plugin", "4 kB", ignoreCore),
  esm("browser-plugin", "3 kB", ignoreCore),
  esm("hash-plugin", "3.5 kB", ignoreCore),
  esm("memory-plugin", "1 kB", ignoreCore),
  esm("logger-plugin", "1.6 kB"),
  esm("persistent-params-plugin", "1.5 kB", ignoreCore),
  esm("lifecycle-plugin", "0.5 kB", ignoreCore),
  esm("preload-plugin", "1.1 kB", ignoreCore),
  esm("search-schema-plugin", "1.1 kB", ignoreCore),
  esm("validation-plugin", "10 kB", ignoreCore),
  esm("ssr-data-plugin", "1 kB", ignoreCore),
  esm("rsc-server-plugin", "1 kB", ignoreCore),

  // ── Utilities ─────────────────────────────────────────────────────
  esm("route-utils", "1 kB"),

  // ── Standalone (zero deps) ────────────────────────────────────────
  esm("logger", "0.5 kB"),
];

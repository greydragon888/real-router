export default [
  // ── Core ──────────────────────────────────────────────────────────
  {
    name: "@real-router/core (ESM)",
    path: "packages/core/dist/esm/index.mjs",
    limit: "20 kB",
  },
  {
    name: "@real-router/core/api (ESM)",
    path: "packages/core/dist/esm/api.mjs",
    limit: "20 kB",
    ignore: ["@real-router/core"],
  },

  // ── UI Bindings ───────────────────────────────────────────────────
  {
    name: "@real-router/react (ESM)",
    path: "packages/react/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: [
      "react",
      "react-dom",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
  },
  {
    name: "@real-router/preact (ESM)",
    path: "packages/preact/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: [
      "preact",
      "preact/hooks",
      "preact/compat",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
  },
  {
    name: "@real-router/solid (ESM)",
    path: "packages/solid/dist/esm/index.mjs",
    limit: "2.6 kB",
    ignore: [
      "solid-js",
      "solid-js/store",
      "solid-js/web",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
  },
  {
    name: "@real-router/vue (ESM)",
    path: "packages/vue/dist/esm/index.mjs",
    limit: "3.5 kB",
    ignore: [
      "vue",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
  },
  {
    name: "@real-router/angular (FESM2022)",
    path: "packages/angular/dist/fesm2022/real-router-angular.mjs",
    limit: "3.5 kB",
    ignore: [
      "@angular/core",
      "@angular/common",
      "@real-router/core",
      "@real-router/core/api",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
  },
  // Note: @real-router/svelte uses svelte-package (individual files),
  // not a single ESM bundle — cannot be measured by size-limit/esbuild.
  {
    name: "@real-router/sources (ESM)",
    path: "packages/sources/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/rx (ESM)",
    path: "packages/rx/dist/esm/index.mjs",
    limit: "1.5 kB",
    ignore: ["@real-router/core"],
  },

  // ── Plugins ───────────────────────────────────────────────────────
  {
    name: "@real-router/validation-plugin (ESM)",
    path: "packages/validation-plugin/dist/esm/index.mjs",
    limit: "10 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/navigation-plugin (ESM)",
    path: "packages/navigation-plugin/dist/esm/index.mjs",
    limit: "3.1 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/browser-plugin (ESM)",
    path: "packages/browser-plugin/dist/esm/index.mjs",
    limit: "2.6 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/hash-plugin (ESM)",
    path: "packages/hash-plugin/dist/esm/index.mjs",
    limit: "2.6 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/memory-plugin (ESM)",
    path: "packages/memory-plugin/dist/esm/index.mjs",
    limit: "1 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/logger-plugin (ESM)",
    path: "packages/logger-plugin/dist/esm/index.mjs",
    limit: "1.6 kB",
  },
  {
    name: "@real-router/persistent-params-plugin (ESM)",
    path: "packages/persistent-params-plugin/dist/esm/index.mjs",
    limit: "1.5 kB",
    ignore: ["@real-router/core"],
  },

  {
    name: "@real-router/ssr-data-plugin (ESM)",
    path: "packages/ssr-data-plugin/dist/esm/index.mjs",
    limit: "0.5 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/lifecycle-plugin (ESM)",
    path: "packages/lifecycle-plugin/dist/esm/index.mjs",
    limit: "0.5 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/preload-plugin (ESM)",
    path: "packages/preload-plugin/dist/esm/index.mjs",
    limit: "1 kB",
    ignore: ["@real-router/core"],
  },
  {
    name: "@real-router/search-schema-plugin (ESM)",
    path: "packages/search-schema-plugin/dist/esm/index.mjs",
    limit: "1.1 kB",
    ignore: ["@real-router/core"],
  },

  // ── Utilities ─────────────────────────────────────────────────────
  {
    name: "@real-router/route-utils (ESM)",
    path: "packages/route-utils/dist/esm/index.mjs",
    limit: "1 kB",
  },

  // ── Standalone (zero deps) ────────────────────────────────────────
  {
    name: "@real-router/logger (ESM)",
    path: "packages/logger/dist/esm/index.mjs",
    limit: "0.5 kB",
  },
];

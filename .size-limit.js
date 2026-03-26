/**
 * esbuild resolves workspace deps via package.json "exports".
 * Adding "development" condition makes esbuild resolve to src/ (individual modules)
 * instead of dist/ (single pre-bundled file), enabling granular tree-shaking.
 *
 * Without this, tree-shaking is less effective because tsup already merged
 * all modules into one file, and esbuild can't eliminate unused code as well.
 */
const addDevelopmentCondition = (config) => ({
  ...config,
  conditions: ["development"],
});

export default [
  // ── Core ──────────────────────────────────────────────────────────
  {
    name: "@real-router/core (ESM)",
    path: "packages/core/dist/esm/index.mjs",
    limit: "20 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/core/api (ESM)",
    path: "packages/core/dist/esm/api.mjs",
    limit: "20 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
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
    modifyEsbuildConfig: addDevelopmentCondition,
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
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/solid (ESM)",
    path: "packages/solid/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: [
      "solid-js",
      "solid-js/store",
      "solid-js/web",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/vue (ESM)",
    path: "packages/vue/dist/esm/index.mjs",
    limit: "3 kB",
    ignore: [
      "vue",
      "@real-router/core",
      "@real-router/route-utils",
      "@real-router/sources",
    ],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  // Note: @real-router/svelte uses svelte-package (individual files),
  // not a single ESM bundle — cannot be measured by size-limit/esbuild.
  {
    name: "@real-router/sources (ESM)",
    path: "packages/sources/dist/esm/index.mjs",
    limit: "1 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/rx (ESM)",
    path: "packages/rx/dist/esm/index.mjs",
    limit: "1.5 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },

  // ── Plugins ───────────────────────────────────────────────────────
  {
    name: "@real-router/validation-plugin (ESM)",
    path: "packages/validation-plugin/dist/esm/index.mjs",
    limit: "10 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/browser-plugin (ESM)",
    path: "packages/browser-plugin/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/hash-plugin (ESM)",
    path: "packages/hash-plugin/dist/esm/index.mjs",
    limit: "2.5 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/logger-plugin (ESM)",
    path: "packages/logger-plugin/dist/esm/index.mjs",
    limit: "1.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/persistent-params-plugin (ESM)",
    path: "packages/persistent-params-plugin/dist/esm/index.mjs",
    limit: "1.5 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },

  {
    name: "@real-router/ssr-data-plugin (ESM)",
    path: "packages/ssr-data-plugin/dist/esm/index.mjs",
    limit: "0.5 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },

  // ── Utilities ─────────────────────────────────────────────────────
  {
    name: "@real-router/route-utils (ESM)",
    path: "packages/route-utils/dist/esm/index.mjs",
    limit: "1 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },

  // ── Standalone (zero deps) ────────────────────────────────────────
  {
    name: "@real-router/fsm (ESM)",
    path: "packages/fsm/dist/esm/index.mjs",
    limit: "0.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/logger (ESM)",
    path: "packages/logger/dist/esm/index.mjs",
    limit: "0.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },

  // ── Internal (bundled into consumers) ─────────────────────────────
  {
    name: "dom-utils (ESM)",
    path: "packages/dom-utils/dist/esm/index.mjs",
    limit: "1 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "route-tree (ESM)",
    path: "packages/route-tree/dist/esm/index.mjs",
    limit: "6 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "path-matcher (ESM)",
    path: "packages/path-matcher/dist/esm/index.mjs",
    limit: "3.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "browser-env (ESM)",
    path: "packages/browser-env/dist/esm/index.mjs",
    limit: "2 kB",
    ignore: ["@real-router/core"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "search-params (ESM)",
    path: "packages/search-params/dist/esm/index.mjs",
    limit: "1.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "type-guards (ESM)",
    path: "packages/type-guards/dist/esm/index.mjs",
    limit: "1.1 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "event-emitter (ESM)",
    path: "packages/event-emitter/dist/esm/index.mjs",
    limit: "1 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
];

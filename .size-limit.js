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
  {
    name: "@real-router/core (ESM)",
    path: "packages/core/dist/esm/index.mjs",
    limit: "25 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/fsm (ESM)",
    path: "packages/fsm/dist/esm/index.mjs",
    limit: "0.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/react (ESM)",
    path: "packages/react/dist/esm/index.mjs",
    limit: "2 kB",
    ignore: ["react", "react-dom"],
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/browser-plugin (ESM)",
    path: "packages/browser-plugin/dist/esm/index.mjs",
    limit: "4 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/rx (ESM)",
    path: "packages/rx/dist/esm/index.mjs",
    limit: "1.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/helpers (ESM)",
    path: "packages/helpers/dist/esm/index.mjs",
    limit: "0.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "@real-router/logger (ESM)",
    path: "packages/logger/dist/esm/index.mjs",
    limit: "0.5 kB",
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
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "path-matcher (ESM)",
    path: "packages/path-matcher/dist/esm/index.mjs",
    limit: "4 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "route-tree (ESM)",
    path: "packages/route-tree/dist/esm/index.mjs",
    limit: "6.5 kB",
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
    limit: "1.5 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
  {
    name: "event-emitter (ESM)",
    path: "packages/event-emitter/dist/esm/index.mjs",
    limit: "2 kB",
    modifyEsbuildConfig: addDevelopmentCondition,
  },
];

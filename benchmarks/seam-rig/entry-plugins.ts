// Core PLUS the two first-party plugins that sit on the injection seams.
// ⚠ The `@real-router/core*` aliases in `build.sh` are what keep this to ONE
// copy of core; without them the plugins resolve their own and every router
// fails the internals lookup.
export { createRouter } from "./packages/core/src/index";
export { getPluginApi } from "./packages/core/src/api/index";
export { searchSchemaPlugin } from "./packages/search-schema-plugin/src/index";
export { persistentParamsPluginFactory } from "./packages/persistent-params-plugin/src/index";

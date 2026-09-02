// Core-only surface for the perf rig. Kept minimal on purpose: every extra
// export is another module the bundler keeps alive on both sides.
export { createRouter } from "./packages/core/src/index";
export { getPluginApi } from "./packages/core/src/api/index";

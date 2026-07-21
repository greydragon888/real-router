// h()-render functions only (no SFC) -> no @vitejs/plugin-vue needed.
import { adapterBuild } from "./base.mts";

// Vue reads its own compile-time feature flags in addition to NODE_ENV: strip
// the devtools bridge + hydration-mismatch diagnostics and silence the
// "feature flag not defined" runtime warning that Vue prints when they're
// absent from a non-bundler build. NODE_ENV="production" (base) gates the
// dev warnings/checks themselves.
export default adapterBuild("vue", "adapter-bench/apps/vue.ts", [], {
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});

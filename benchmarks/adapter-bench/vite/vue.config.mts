// h()-render functions only (no SFC) -> no @vitejs/plugin-vue needed.
import { adapterBuild } from "./base.mts";

export default adapterBuild("vue", "adapter-bench/apps/vue.ts");

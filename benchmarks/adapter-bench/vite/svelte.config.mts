import { svelte } from "@sveltejs/vite-plugin-svelte";

import { adapterBuild } from "./base.mts";

export default adapterBuild("svelte", "adapter-bench/apps/svelte/index.ts", [
  svelte({ hot: false }),
]);

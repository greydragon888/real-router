import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";

import { adapterBuild } from "./base.mts";

const config = adapterBuild(
  "svelte",
  "adapter-bench/apps/svelte/index.ts",
  [svelte()],
);

// @real-router/svelte resolves through the `@real-router/internal-source`
// condition base.mts selects for this suite, to its src entry; this alias
// names the same file. Vite compiles the .svelte files that entry imports,
// and the CI runner builds no packages/svelte/dist.
config.resolve = {
  ...config.resolve,
  alias: {
    "@real-router/svelte": path.resolve(
      import.meta.dirname,
      "../../../packages/svelte/src/index.ts",
    ),
  },
};

export default config;

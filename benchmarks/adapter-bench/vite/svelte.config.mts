import path from "node:path";

import { svelte } from "@sveltejs/vite-plugin-svelte";

import { adapterBuild } from "./base.mts";

const config = adapterBuild(
  "svelte",
  "adapter-bench/apps/svelte/index.ts",
  [svelte({ hot: false })],
);

// @real-router/svelte is the ONE adapter without the internal-source export
// condition (deliberate: its src entry imports .svelte files, which tsc
// cannot consume — the condition would break monorepo-wide type-check).
// Vite CAN compile .svelte, so alias the package straight to src here to
// keep this suite measuring live source like the others (and to build at
// all on the CI runner, where packages/svelte/dist never exists).
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

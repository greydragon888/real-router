import solidPlugin from "vite-plugin-solid";

import { adapterBuild } from "./base.mts";

export default adapterBuild("solid", "adapter-bench/apps/solid.tsx", [
  solidPlugin(),
]);

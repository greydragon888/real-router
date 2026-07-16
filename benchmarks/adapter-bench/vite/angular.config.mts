import angular from "@analogjs/vite-plugin-angular";

import { adapterBuild } from "./base.mts";

// internalSource: false — see base.mts: the analog plugin strips exports from
// out-of-scope workspace src, so this suite resolves every @real-router
// package to built dist (adapter = ng-packagr FESM linked by the plugin,
// core/plugins = tsdown dist). Prebuild runs the bundle graph first.
export default adapterBuild(
  "angular",
  "adapter-bench/apps/angular/main.ts",
  [angular({ tsconfig: "adapter-bench/apps/angular/tsconfig.app.json" })],
  { internalSource: false },
);

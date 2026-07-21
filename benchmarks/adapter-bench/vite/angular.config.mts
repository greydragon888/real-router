import angular from "@analogjs/vite-plugin-angular";

import { adapterBuild } from "./base.mts";

// internalSource: false — see base.mts: the analog plugin strips exports from
// out-of-scope workspace src, so this suite resolves every @real-router
// package to built dist (adapter = ng-packagr FESM linked by the plugin,
// core/plugins = tsdown dist). Prebuild runs the bundle graph first.
// Angular gates its dev assertions on the `ngDevMode` global, NOT NODE_ENV:
// `typeof ngDevMode === 'undefined' || ngDevMode` — so a bench build that
// never defines it leaves ngDevMode truthy and runs the DEVELOPMENT runtime
// (assertions, dev-only bookkeeping → syscalls). Defining it `false` strips
// those, exactly as `ng build` (production) does.
export default adapterBuild(
  "angular",
  "adapter-bench/apps/angular/main.ts",
  [angular({ tsconfig: "adapter-bench/apps/angular/tsconfig.app.json" })],
  { internalSource: false, define: { ngDevMode: "false" } },
);

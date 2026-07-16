// No plugin: vite's esbuild honours the per-file `@jsxImportSource preact`
// pragma (automatic runtime) — HMR/devtools features of a preset are not
// needed for a prebuild.
import { adapterBuild } from "./base.mts";

export default adapterBuild("preact", "adapter-bench/apps/preact.tsx");

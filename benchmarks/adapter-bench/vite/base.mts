/**
 * Shared vite prebuild factory: one self-contained ESM bundle per adapter
 * (framework runtime + adapter + core + memory-plugin, production), resolved
 * from live `src` via the `@real-router/internal-source` condition. The bench
 * process imports the artifact after installing jsdom globals — build stays
 * OUTSIDE the CodSpeed instrumentation.
 *
 * PRODUCTION runtime is forced via `define`, not left to the environment.
 * Vite's `build.lib` mode deliberately does NOT replace `process.env.NODE_ENV`
 * (a library must adapt to its host), so the un-replaced checks resolve at
 * RUNTIME — and the bench process (`node … codspeed.mts`) runs with NODE_ENV
 * unset, so every framework fell back to its DEVELOPMENT runtime: React's
 * profiler timers + act-warnings, Vue's dev warnings + devtools hooks, Angular's
 * `ngDevMode` assertions. Those dev paths hammer `clock_gettime`/`write`
 * syscalls that CodSpeed's Simulation (callgrind) instrument cannot measure
 * consistently (the "N system calls, totalling …" warning) AND they measure
 * dev overhead instead of the shipped hot path. Statically substituting
 * `"production"` lets rollup constant-fold + tree-shake the dev branches out
 * entirely, so the benches measure the real production adapter/router work.
 *
 * `internalSource: false` (angular): the analog plugin runs the Angular
 * compiler over every .ts in the module graph, and workspace src outside its
 * tsconfig scope comes out stripped of exports — so the angular suite
 * resolves ALL @real-router packages to their built dist (exactly how the
 * cross-router angular apps work; the adapter's shipped FESM is the only
 * consumable form of that package anyway). Its prebuild therefore needs
 * `pnpm turbo run bundle` for the angular graph first.
 */
import { defaultClientConditions, defineConfig } from "vite";

import type { PluginOption } from "vite";

export function adapterBuild(
  fw: string,
  entry: string,
  plugins: PluginOption[] = [],
  {
    internalSource = true,
    define = {},
  }: {
    internalSource?: boolean;
    /** Extra compile-time constants (framework dev-flag strips, merged last). */
    define?: Record<string, string>;
  } = {},
): ReturnType<typeof defineConfig> {
  return defineConfig({
    // Explicit so a bare `vite build` (already production by default) can never
    // be flipped by an ambient `--mode`/NODE_ENV — the define below is what
    // actually strips dev code, this just documents intent.
    mode: "production",
    plugins,
    define: {
      // Force the production runtime of every framework (see file header).
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...define,
    },
    resolve: internalSource
      ? {
          // Vite 6+ REPLACES the default condition list when this is set —
          // spread the defaults back or packages with browser/server export
          // splits (svelte!) resolve to their SERVER runtime.
          conditions: [
            "@real-router/internal-source",
            ...defaultClientConditions,
          ],
        }
      : {},
    build: {
      outDir: `adapter-bench/dist/${fw}`,
      emptyOutDir: true,
      // Names stay readable for the CodSpeed flamegraph — dev-code elimination
      // comes from the `define` constant-fold + rollup tree-shake, not minify.
      minify: false,
      target: "node20",
      lib: {
        entry,
        formats: ["es"],
        fileName: "app",
      },
      rollupOptions: {
        external: [],
      },
    },
  });
}

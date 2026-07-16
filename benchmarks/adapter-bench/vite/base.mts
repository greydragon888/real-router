/**
 * Shared vite prebuild factory: one self-contained ESM bundle per adapter
 * (framework runtime + adapter + core + memory-plugin, production), resolved
 * from live `src` via the `@real-router/internal-source` condition. The bench
 * process imports the artifact after installing jsdom globals — build stays
 * OUTSIDE the CodSpeed instrumentation.
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
  { internalSource = true }: { internalSource?: boolean } = {},
): ReturnType<typeof defineConfig> {
  return defineConfig({
    plugins,
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

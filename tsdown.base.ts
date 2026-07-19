import { defineConfig } from "tsdown";

import type { UserConfig } from "tsdown";

/**
 * Options for creating tsdown configuration
 */
export interface CreateConfigOptions {
  /**
   * Target platform
   * - "neutral" - universal code (works everywhere)
   * - "browser" - browser only
   * - "node" - Node.js only
   *
   * @default "neutral"
   */
  platform?: "neutral" | "browser" | "node";

  /**
   * Enable minification
   *
   * @default true
   */
  minify?: boolean;

  /**
   * Enable sourcemaps
   *
   * @default true
   */
  sourcemap?: boolean;

  /**
   * Custom tsdown options (will override base options)
   */
  custom?: Partial<UserConfig>;
}

/**
 * Creates tsdown configuration for ESM and CJS formats
 *
 * Generates dual format output with co-located type definitions.
 * Uses separate outDir per format to match tsup's output structure:
 * ```
 * dist/
 * ├── esm/
 * │   ├── index.mjs
 * │   ├── index.mjs.map
 * │   └── index.d.mts
 * └── cjs/
 *     ├── index.js
 *     ├── index.js.map
 *     └── index.d.ts
 * ```
 */
export const createConfig = (opts: CreateConfigOptions = {}): UserConfig[] => {
  const {
    platform = "neutral",
    minify = true,
    sourcemap = true,
    custom = {},
  } = opts;

  const commonConfig: Partial<UserConfig> = {
    // Entry point
    entry: ["src/index.ts"],

    // Target ES2022 - widely compatible
    target: "es2022",

    // Platform
    platform,

    // Generate type definitions with declaration maps (.d.ts.map)
    // Maps .d.ts → .ts source for IDE go-to-definition (#423)
    dts: { sourcemap: true },

    // Sourcemaps
    sourcemap,

    // Minification (oxc minifier)
    minify,

    // Shims for CJS compatibility (__dirname, __filename)
    shims: true,

    // Fail on warnings in CI
    failOnWarn: "ci-only",

    // Validate the published package on every bundle, consolidating the former
    // separate `lint:package` (publint) / `lint:types` (attw) turbo tasks into
    // the build itself — so a package can't be bundled without being validated.
    // publint: package.json exports + file existence; attw: .d.ts resolution
    // across node10 / node16-cjs / node16-esm / bundler (same coverage as the
    // old `attw --pack .`). tsdown runs each ONCE after the full dist (verified
    // on the core pilot — not per ESM/CJS config). Non-tsdown packages (solid =
    // rollup, angular = ng-packagr, svelte = svelte-package) are NOT covered and
    // keep their own validation. See IMPLEMENTATION_NOTES "Release-pipeline...".
    publint: true,
    attw: true,
  };

  // Generate separate configs for ESM and CJS (matching tsup's per-format outDir)
  return [
    defineConfig({
      ...commonConfig,
      format: "esm",
      outDir: "dist/esm",
      ...custom,
    }),
    defineConfig({
      ...commonConfig,
      format: "cjs",
      outDir: "dist/cjs",
      ...custom,
    }),
  ];
};

/**
 * Creates configuration for browser-only package
 */
export const createBrowserConfig = (
  opts: Omit<CreateConfigOptions, "platform"> = {},
): UserConfig[] => createConfig({ ...opts, platform: "browser" });

/**
 * Creates configuration for isomorphic package (browser + server)
 */
export const createIsomorphicConfig = (
  opts: Omit<CreateConfigOptions, "platform"> = {},
): UserConfig[] => createConfig({ ...opts, platform: "neutral" });

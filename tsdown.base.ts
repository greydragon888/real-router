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
   * Dependency bundling configuration
   */
  deps?: {
    /** Dependencies to always bundle (replaces tsup's noExternal) */
    alwaysBundle?: string[];
    /** Whitelist of allowed bundled deps (suppresses warnings) */
    onlyBundle?: string[];
  };

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
    deps,
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

    // Generate type definitions
    dts: true,

    // Sourcemaps
    sourcemap,

    // Minification (oxc minifier)
    minify,

    // Shims for CJS compatibility (__dirname, __filename)
    shims: true,

    // Fail on warnings in CI
    failOnWarn: "ci-only",

    // Bundle specific dependencies
    ...(deps?.alwaysBundle || deps?.onlyBundle
      ? {
          deps: {
            ...(deps.alwaysBundle && { alwaysBundle: deps.alwaysBundle }),
            ...(deps.onlyBundle && { onlyBundle: deps.onlyBundle }),
          },
        }
      : {}),
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
) => createConfig({ ...opts, platform: "browser" });

/**
 * Creates configuration for isomorphic package (browser + server)
 */
export const createIsomorphicConfig = (
  opts: Omit<CreateConfigOptions, "platform"> = {},
) => createConfig({ ...opts, platform: "neutral" });

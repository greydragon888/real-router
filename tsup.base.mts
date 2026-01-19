import type { Format, Options } from "tsup";

const OUT_DIR = "dist";

/**
 * Options for creating tsup configuration
 */
export interface CreateConfigOptions {
  /**
   * Target platform
   * - "neutral" - universal code (works everywhere)
   * - "browser" - browser only
   * - "node" - Node.js only
   * @default "neutral"
   */
  platform?: Options["platform"];

  /**
   * Additional external dependencies
   * @default []
   */
  external?: string[];

  /**
   * Dependencies to bundle (don't make external)
   * Useful for internal implementation details
   * @default []
   * @example ["route-node"]
   */
  noExternal?: string[];

  /**
   * Enable minification
   * - true: always minify
   * - false: never minify
   * - "auto": minify only in production (NODE_ENV)
   * @default true
   */
  minify?: boolean | "auto";

  /**
   * Custom tsup options (will override base options)
   */
  custom?: Partial<Options>;
}

/**
 * Creates tsup configuration for ESM and CJS formats with co-located type definitions
 *
 * Generates structure:
 * ```
 * dist/
 * ├── esm/
 * │   ├── index.mjs
 * │   ├── index.mjs.map
 * │   └── index.d.mts      (ESM type definitions)
 * └── cjs/
 *     ├── index.js
 *     ├── index.js.map
 *     └── index.d.ts       (CJS type definitions)
 * ```
 *
 * @example
 * ```ts
 * // Basic configuration
 * export default createConfig();
 *
 * // Browser-only package
 * export default createConfig({ platform: "browser" });
 *
 * // Bundle internal dependencies
 * export default createConfig({ noExternal: ["route-node"] });
 * ```
 */
export const createConfig = (opts: CreateConfigOptions = {}): Options[] => {
  const {
    platform = "neutral",
    external = [],
    noExternal = [],
    minify = true,
    custom = {},
  } = opts;

  // Determine if minification is needed
  // Use Terser for better compression (slower than esbuild but ~5-10% smaller)
  const shouldMinify =
    minify === "auto" ? process.env.NODE_ENV === "production" : minify;

  const commonConfig: Partial<Options> = {
    // Entry point
    entry: ["modules/index.ts"],

    // Clean dist before build
    clean: true,

    // Use Terser for minification (better compression than esbuild)
    minify: shouldMinify ? "terser" : false,

    // Terser options for aggressive minification
    terserOptions: {
      compress: {
        passes: 2, // Run compression twice for better results
        pure_getters: true, // Assume getters have no side effects
        unsafe_arrows: true, // Convert functions to arrow functions where possible
        unsafe_methods: true, // Optimize method calls
        drop_debugger: true, // Remove debugger statements
      },
      mangle: {
        properties: false, // Don't mangle properties (safer for public API)
      },
      format: {
        comments: false, // Remove all comments
      },
    },

    // Sourcemaps for debugging (always)
    sourcemap: true,

    // Target ES2022 - widely compatible with modern browsers/Node.js
    target: "es2022",

    // Platform
    platform,

    // Enable tree-shaking (dead code elimination)
    treeshake: {
      preset: "recommended", // More aggressive tree-shaking
    },

    // External dependencies (don't include in bundle)
    // tsup automatically adds all dependencies and peerDependencies from package.json
    external: [...external],

    // Dependencies to bundle (overrides automatic external)
    noExternal: [...noExternal],

    // Shims for CJS compatibility (__dirname, __filename, etc)
    shims: true,

    // Metafile for bundle analysis
    metafile: true,

    // Can be uncommented for automatic bundle analysis
    // onSuccess: "npm run analyze:bundle",
  };

  // Generate configurations for ESM and CJS (with co-located type definitions)
  return (["esm", "cjs"] as Format[]).map((format: Format) => ({
    ...commonConfig,
    format,

    // Generate type definitions alongside code
    // ESM → dist/esm/index.d.mts
    // CJS → dist/cjs/index.d.ts
    dts: {
      resolve: true, // Resolve types from dependencies
    },

    // Output directory for each format
    outDir: `${OUT_DIR}/${format}`,

    // File extensions
    outExtension({ format }: { format: Format }) {
      return {
        js: format === "esm" ? ".mjs" : ".js",
      };
    },

    // Custom options (override base options)
    ...custom,
  }));
};

/**
 * Creates configuration for browser-only package
 *
 * @example
 * ```ts
 * // packages/real-router-plugin-browser/tsup.config.mts
 * export default createBrowserConfig();
 * ```
 */
export const createBrowserConfig = (
  opts: Omit<CreateConfigOptions, "platform"> = {},
) => createConfig({ ...opts, platform: "browser" });

/**
 * Creates configuration for isomorphic package (browser + server)
 * Code works everywhere: in browser, Node.js, Deno, Bun, etc.
 *
 * @example
 * ```ts
 * // packages/real-router/tsup.config.mts
 * export default createIsomorphicConfig();
 * ```
 */
export const createIsomorphicConfig = (
  opts: Omit<CreateConfigOptions, "platform"> = {},
) => createConfig({ ...opts, platform: "neutral" });

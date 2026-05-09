import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import dts from "rollup-plugin-dts";

const extensions = [".js", ".ts", ".tsx"];

const external = [
  "solid-js",
  "solid-js/web",
  "solid-js/store",
  "@real-router/core",
  "@real-router/core/api",
  "@real-router/sources",
  "@real-router/route-utils",
];

const sharedPlugins = [
  nodeResolve({ extensions }),
  babel({
    extensions,
    babelHelpers: "bundled",
    babelrc: false,
    presets: ["babel-preset-solid", "@babel/preset-typescript"],
    exclude: "node_modules/**",
  }),
];

/**
 * JS bundles (ESM + CJS) — compiled via babel-preset-solid
 */
const indexJs = {
  input: "src/index.tsx",
  output: [
    { file: "dist/esm/index.mjs", format: "es" },
    { file: "dist/cjs/index.js", format: "cjs", exports: "named" },
  ],
  external,
  plugins: sharedPlugins,
};

const ssrJs = {
  input: "src/ssr.tsx",
  output: [
    { file: "dist/esm/ssr.mjs", format: "es" },
    { file: "dist/cjs/ssr.js", format: "cjs", exports: "named" },
  ],
  external,
  plugins: sharedPlugins,
};

/**
 * Declaration bundles — bundled from tsc output via rollup-plugin-dts
 * Produces co-located .d.ts / .d.mts matching the JS bundles
 */
const dtsBundles = [
  {
    input: "dist/types/index.d.ts",
    output: { file: "dist/esm/index.d.mts", format: "es" },
    external,
    plugins: [dts()],
  },
  {
    input: "dist/types/index.d.ts",
    output: { file: "dist/cjs/index.d.ts", format: "cjs" },
    external,
    plugins: [dts()],
  },
  {
    input: "dist/types/ssr.d.ts",
    output: { file: "dist/esm/ssr.d.mts", format: "es" },
    external,
    plugins: [dts()],
  },
  {
    input: "dist/types/ssr.d.ts",
    output: { file: "dist/cjs/ssr.d.ts", format: "cjs" },
    external,
    plugins: [dts()],
  },
];

export default [indexJs, ssrJs, ...dtsBundles];

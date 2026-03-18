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

/**
 * JS bundles (ESM + CJS) — compiled via babel-preset-solid
 */
const jsBundles = {
  input: "src/index.tsx",
  output: [
    { file: "dist/esm/index.mjs", format: "es" },
    { file: "dist/cjs/index.js", format: "cjs", exports: "named" },
  ],
  external,
  plugins: [
    nodeResolve({ extensions }),
    babel({
      extensions,
      babelHelpers: "bundled",
      babelrc: false,
      presets: ["babel-preset-solid", "@babel/preset-typescript"],
      exclude: "node_modules/**",
    }),
  ],
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
];

export default [jsBundles, ...dtsBundles];

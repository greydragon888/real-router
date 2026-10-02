import { readFileSync } from "node:fs";

import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import dts from "rollup-plugin-dts";

import { externalFrom } from "./rollup.external.mjs";

const extensions = [".js", ".ts", ".tsx"];

const external = externalFrom(
  JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")),
);

/**
 * Both entries in ONE input, in every build: rollup then emits each module
 * once, in a chunk both entries import. An input per entry would inline
 * `context.ts` into each of them, and `/ssr`'s hooks would read contexts the
 * main entry's `RouterProvider` never provides.
 */
const input = { index: "src/index.tsx", ssr: "src/ssr.tsx" };

const babelPlugin = (presets) =>
  babel({
    extensions,
    babelHelpers: "bundled",
    babelrc: false,
    presets,
    exclude: "node_modules/**",
  });

/**
 * JS bundles (ESM + CJS) — compiled via babel-preset-solid for the DOM, for
 * consumers whose bundler does not compile Solid.
 */
const compiledJs = {
  input,
  output: [
    {
      dir: "dist/esm",
      format: "es",
      entryFileNames: "[name].mjs",
      chunkFileNames: "[name]-[hash].mjs",
    },
    {
      dir: "dist/cjs",
      format: "cjs",
      exports: "named",
      entryFileNames: "[name].js",
      chunkFileNames: "[name]-[hash].js",
    },
  ],
  external,
  plugins: [
    nodeResolve({ extensions }),
    babelPlugin(["babel-preset-solid", "@babel/preset-typescript"]),
  ],
};

/**
 * Source bundle — types stripped, JSX kept, published under the `solid`
 * export condition. vite-plugin-solid compiles a dependency that declares it
 * for the consumer's own target (DOM, hydratable or SSR), which is what an SSR
 * build needs: the DOM output above calls `template()` at module load.
 */
const sourceJsx = {
  input,
  jsx: "preserve",
  output: {
    dir: "dist/source",
    format: "es",
    entryFileNames: "[name].jsx",
    chunkFileNames: "[name]-[hash].jsx",
  },
  external,
  plugins: [
    nodeResolve({ extensions }),
    babelPlugin(["@babel/preset-typescript"]),
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

export default [compiledJs, sourceJsx, ...dtsBundles];

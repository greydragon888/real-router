import { createIsomorphicConfig } from "../../tsdown.base.js";

export default createIsomorphicConfig({
  custom: {
    entry: {
      index: "src/index.ts",
      legacy: "src/legacy.ts",
      ink: "src/ink.ts",
      "index.react-server": "src/index.react-server.ts",
      ssr: "src/ssr.ts",
      "ssr.react-server": "src/ssr.react-server.ts",
      "legacy.ssr": "src/legacy.ssr.ts",
    },

    // `./ink` is deliberately ESM-only (see package.json exports): its CJS build
    // would `require("ink")`, and ink@7 is an ESM-only package with top-level
    // await in its graph, so Node throws "require() cannot be used on an ESM
    // graph with top-level await" — the condition could never load. attw runs
    // under the `strict` profile, which requires EVERY entrypoint to resolve in
    // EVERY mode, so it reports `No resolution (node16-cjs)` here; with
    // `failOnWarn: "ci-only"` that fails the build in CI.
    //
    // Excluding this one entrypoint is the narrow fix. The alternatives are both
    // package-wide: `profile: "esm-only"` would stop flagging CJS-resolution
    // problems for the six genuinely dual entries too (exactly what attw exists
    // to catch), and `ignoreRules: ["no-resolution"]` would also silence a
    // missing ESM resolution anywhere. Residual risk here is small: ink's `.d.mts`
    // comes off the same rolldown-dts pipeline as the six entries that stay
    // checked, its runtime ESM resolution is asserted by the package smoke test,
    // and `tests/functional/ink-entry.test.tsx` exercises the entry itself.
    attw: { excludeEntrypoints: ["./ink"] },
  },
});

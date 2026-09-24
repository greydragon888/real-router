import angular from "@analogjs/vite-plugin-angular";
import { mergeConfig, defineConfig } from "vitest/config";
import { commonConfig } from "../../vitest.config.common.mjs";
import unitConfig from "../../vitest.config.unit.mjs";

// Two-project layout (#1512, RFC `.claude/rfc-1512-aot-unit-coverage-ru.md`):
//
//   - "jit" — the pre-existing suite, transpiled by esbuild exactly as before.
//     Signal-based initializer APIs (`contentChildren()`, `input()`) are NOT
//     registered without a compiler transform, so `contentChildren` queries
//     stay empty there (the documented JIT ceiling, CLAUDE.md "Coverage
//     Ceiling").
//   - "aot" — ONLY `tests/aot/**`, compiled by @analogjs/vite-plugin-angular
//     (full Ivy AOT), where those queries populate for real. Hosts the
//     RouteView fallback/duplicate-marker fixtures that are structurally
//     unreachable under JIT.
//
// Coverage is a ROOT-only option: one run → one merged report across both
// projects, so AOT-only hits count toward the thresholds below. That merge is
// the load-bearing property — a separate `test:aot` config would produce a
// separate report and the `v8 ignore` in RouteView.ts could never be removed.
export default mergeConfig(
  unitConfig,
  defineConfig({
    test: {
      coverage: {
        // These floors measure angular's own code. `src/dom-utils` is the
        // `shared/dom-utils` symlink, which `vitest.config.unit.mts` leaves
        // out of every consumer's coverage; react measures it as its owner
        // (#2552). What keeps the floors below 100 is merge duplicates: the
        // jit (esbuild) and aot (Angular) emits map some statements of
        // dual-tested files (RouteView, RealLink, RealLinkActive) to
        // different ranges, so the merged report keeps uncovered jit-emit
        // twins of lines the aot map covers (verify with
        // `pnpm test --project aot`) — plus a few AOT-emit phantom branches.
        // The floors are measured and locked to catch regressions.
        thresholds: {
          statements: 96,
          branches: 86,
          functions: 98,
          lines: 97,
        },
      },
      projects: [
        {
          // Inherits the merged root config: tsconfigPaths plugin, workspace
          // src aliases, globals/mocks/pool settings.
          extends: true,
          test: {
            name: "jit",
            environment: "jsdom",
            include: ["./tests/**/*.test.ts"],
            exclude: ["./tests/aot/**"],
            setupFiles: "./tests/setup.ts",
          },
        },
        {
          // Hand-rolled config — deliberately NO `extends: true`: the analog
          // plugin must be FIRST in the plugin chain, and inheriting the root
          // would prepend tsconfigPaths ahead of it. (Not inheriting is the
          // default; `extends: false` is not even a valid type.)
          plugins: [
            angular({
              tsconfig: new URL("./tsconfig.spec.aot.json", import.meta.url)
                .pathname,
              // AOT-transform scope = the MINIMUM that needs the Angular
              // compiler: the fixtures themselves (inline @Component hosts)
              // plus the components/directives they exercise (whose
              // contentChildren()/input() initializer APIs only register under
              // a compiler transform). Everything else — dependency src
              // (core/sources/…, which the plugin would export-mangle, see
              // IMPLEMENTATION_NOTES §adapter-bench) AND this package's plain
              // TS (providers, functions, dom-utils) — keeps the default
              // esbuild pipeline. Plain TS matters for coverage, not just
              // safety: the Angular emit maps function positions differently
              // than esbuild, so every file it compiles DOUBLES its function
              // entries in the merged jit+aot coverage report (measured
              // 2026-07-18: a package-wide filter collapsed the functions
              // metric 98.18% → 87.19% while statements stayed green). Keeping
              // the AOT emit down to the files the fixtures actually assert on
              // confines that duplication to code the fixtures fully execute.
              transformFilter: (_code, id) =>
                id.includes("/packages/angular/tests/aot/") ||
                id.includes("/packages/angular/src/components/RouteView.ts") ||
                id.includes("/packages/angular/src/directives/"),
              // Type-checking is the package's own tsc gate; skipping it here
              // keeps the AOT program fast.
              disableTypeChecking: true,
            }),
          ],
          // Same workspace src aliases as every other suite (coverage runs
          // against src). Read off the exported common config rather than
          // re-deriving them.
          resolve: { alias: commonConfig.resolve?.alias ?? {} },
          // The analog plugin disables vite's built-in esbuild transform
          // unless the user config sets one (`config.esbuild ?? false` in its
          // config hook). With the narrow transformFilter above, every .ts
          // OUTSIDE the AOT scope (providers, dom-utils, dependency src)
          // still needs that esbuild pass — without this line they reach the
          // module runner as raw TS and rollup fails on `import type`.
          esbuild: {},
          // Never share the transform cache with the jit project — the same
          // .ts files compile to different outputs (esbuild vs Angular AOT).
          cacheDir: "./.vitest-aot",
          test: {
            name: "aot",
            environment: "jsdom",
            globals: true,
            pool: "threads",
            include: ["./tests/aot/**/*.test.ts"],
            setupFiles: "./tests/aot/setup.ts",
          },
        },
      ],
    },
  }),
);

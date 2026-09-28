# router-benchmarks

> Benchmarks of this checkout's packages: the adapter hot-path suite CodSpeed runs (`adapter-bench/`) and the plugin-seam benches (`plugin-seam/`, `seam-rig/`). CodSpeed's core hot-path suite is `packages/core/tests/benchmarks/`, and `scripts/codspeed-gate.mjs` decides whether a change reaches what the suites measure. The cross-router benchmark — the published releases against the competitors, in a real browser — is [cross-router-bench/CLAUDE.md](../cross-router-bench/CLAUDE.md).

## Structure

```
benchmarks/
├── adapter-bench/   # `pnpm bench:adapter`: vite-built apps per framework, measured by adapter-bench/codspeed.mts
├── plugin-seam/     # `pnpm bench:seam`: plugin-seam/bench.mts
├── seam-rig/        # entries importing ./packages/core/src/… from a `git archive` tree (see Utilities)
└── eslint.config.mjs · tsconfig.json · tsconfig.node.json
```

## Utilities

```bash
pnpm cpu                # Check CPU load before benchmarking (run from benchmarks/)
```

`lint:bench` is ESLint over this tree; the adapter-bench `.svelte` components
are included, and pre-push runs it after its build. CI runs it too when a pull request edits the tree or a lockfile or
global-input change reaches it, such as an ESLint bump (#2402), and so does
the weekly `cross-router-bench.yml`. Run it through turbo — `pnpm turbo run lint:bench --filter=router-benchmarks`: it builds no package, its `^type-check` puts the packages' `src` into its cache key, and it depends on `type-check:bench` below, so the type-check runs wherever the lint does.

⚠ **A lint fix in `adapter-bench/apps` must leave the built bundle
byte-identical.** The results were measured on those bytes. The rules whose
fixes change the program are off for those paths in this directory's
`eslint.config.mjs`, each with the measurement behind it; before trusting a new
fix there, build the touched apps before and after it and compare the outputs.

`type-check:bench` runs `tsc` over **three** configs, and `benchmarks/tsconfig.json`
is not one of them — it holds no file of its own. Its turbo inputs cover `.mts`
and every `tsconfig*.json`, which the packages' `type-check` inputs do not. By
hand, the same three:

```bash
tsc --noEmit -p benchmarks/adapter-bench/tsconfig.json            # adapter-bench + plugin-seam (all but the two below)
tsc --noEmit -p benchmarks/adapter-bench/tsconfig.preact.json     # adapter-bench apps/preact.tsx
tsc --noEmit -p benchmarks/adapter-bench/tsconfig.solid.json      # adapter-bench apps/solid.tsx
```

The cross-router benchmark's three are in [its CLAUDE.md](../cross-router-bench/CLAUDE.md).

⚠ **A framework whose JSX runtime is not React's needs its own config, not an
exclusion.** `apps/preact.tsx` and `apps/solid.tsx` are carved out of the main
`include` because one `jsx` setting cannot serve six frameworks: folded back in,
they raise 31 errors, all from `packages/preact` and `packages/solid` and none
from an app's own code. The carve-outs mirror what each adapter package already
declares — preact `jsx: react-jsx` + `jsxImportSource: preact`, solid
`jsx: preserve` + `jsxImportSource: solid-js` (#2167).

`benchmarks/tsconfig.node.json` is not in the list either: it holds the repo's
ROOT `*.mts` and `tsdown.base.ts`, no benchmarks file at all. It is what
`benchmarks/tsconfig.json` exists to reference — `tsc -b benchmarks` reaches it,
and nothing else does.

Out of reach of all three, by construction rather than by oversight: `seam-rig/`
entries import `./packages/core/src/…`, a tree `git archive` materialises at
bundle time. For a probe, the check is running it.

⚠ **`apps/svelte/index.ts` is checked, its templates are not.** Its
`./Host.svelte` import lands on Svelte's ambient `*.svelte` declaration
(`LegacyComponentType`), so the import is typed but the component's own props
are the build's business, not `tsc`'s.

⚠ **The lint's typed rules read the components, in a `Bundler` program.**
`adapter-bench/apps/svelte/tsconfig.json` exists for that; `tsc` reads no
`.svelte` file through it. Under the root's `NodeNext`, `@real-router/svelte`'s
source cannot resolve its own extensionless `./composables/*.svelte` imports,
and every hook it exports lints as an error type (#2556).

⚠ **A green run says nothing about how much it looked at.** Narrowing an
`include` makes every one of these commands greener, so coverage is the one
property they cannot self-report. Re-derive it rather than trust it:

```bash
tsc --noEmit -p <config> --listFiles | grep -c "/benchmarks/<dir>/"
```

## Reading a CodSpeed report (#1711 / #1728)

The CI numbers come from a **valgrind cost model**, not a clock: `cpuTotal` is
instructions + cache misses + memory accesses. Two failure modes have already
cost a day each, and both are cheap to rule out — in this order, before
investigating anything.

### 1. Read `sysSeconds` first, `cpuTotal` never alone

It is bimodal, with nothing in between: **~0.0002 s when clean, 1.4–3.9 s during
a surge**. A surged run inflates `cpuTotal` by ~4 % and the memory column by
~18 %. Re-dispatch the same SHA and read again.

⛔ **Do NOT use `sysCount` as the separator.** It moves for the run AND for the
code — two builds of `beginTransition` differing by 28 bytes sat at 13 and 22
with `sysSeconds` clean in both. An elevated `sysCount` on a clean run is a
property of the code and will reproduce however often you re-dispatch.

The known cause of surges — the first run of a branch the runner has not seen —
is fixed by the settle step in `codspeed.yml` (`sync` + 10 s between `Setup` and
the suite). Check anyway: it was never 100 % reproducible.

### 2. A step with no plausible mechanism: check the WALL CLOCK before digging

The model can report a step the clock does not see. Measured on
`navigate/sync-baseline`: **+15.5 % under CodSpeed, −2.9 % by the clock on the
same x64 runner** (and +0.3 % on arm64) — i.e. the "slow" build was faster. The
arc's state there is gated by the **summed bytecode** of `beginTransition` +
`planPhases` (slow inside 600…821 bytes), so any refactor moving that pair by
~30 bytes flips the report by 15 % in either direction.

⚠ That window was measured with Maglev on, before `@codspeed/core` 6.0 added
`--no-maglev` (IMPLEMENTATION_NOTES "CodSpeed simulation runs without
Maglev"). A window gated by bytecode size fits a tier-up landing inside the
measured call; whether it survives without Maglev is unmeasured.

Protocol, ~3 minutes, and it settles the question outright:

```bash
# one bundle per ref — tsx does NOT work here (its code never reaches the dump)
node_modules/.bin/esbuild <bench-entry>.ts --bundle --platform=node --format=cjs   --outfile=/tmp/a.cjs --conditions=@real-router/internal-source
# then: A/A floor FIRST, then ALTERNATING processes, medians of 5-7 pairs
```

Two numbers from two consecutive runs are not a comparison. Without the A/A
floor a delta has no scale — it was ~7 % locally and ~23 % on the runner, so
anything smaller is noise.

### 3. Corroboration beats a single arc

A genuine slowdown in `navigate` drags its neighbours (`navigate/params`,
`navigate/leave-1` share the path). One arc moving alone, with its siblings
still, is a reason to suspect the instrument rather than the code.

Full record of how all three were established:
`packages/core/.claude/research/rfc-1728-navigate-syscall-step-2026-08-09.md`.

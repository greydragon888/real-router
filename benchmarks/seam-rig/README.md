# seam-rig

**Two REFS, one question: what does moving the injection seam cost?** (#1938)

The sibling of `plugin-seam/`, and the two do different jobs. `plugin-seam/` is a
benchmark: one tree, wired into the CodSpeed run, so a regression on the href
door is caught on the PR that causes it. This rig compares **two arbitrary refs**
— a prototype branch against `master`, an idea against the idea before it — which
a gate cannot do and which is what a design decision actually needs.

It bundles each side with esbuild rather than running the workspace, and that is
not a preference: a ref materialised with `git archive` has no `node_modules`, so
nothing there can be imported by package name. Bundling is what makes a two-ref
comparison possible without an install per side.

## Why the plugins have to be in the process

The question is what a SEAM MOVE costs, and a seam move puts the **plugin's**
work on a door it did not run on before. Measured, the difference between a
stand-in and the real thing is not a detail:

| what ran on the href door | Δ master → O-1b |
| --- | --- |
| a trivial pass-through interceptor | +16 % |
| the real `searchSchemaPlugin` with a 3-key zod schema | **+68 %** |

The first number was published in a report and was wrong by ~7×. That is what
`bench-plugins.mjs` exists to prevent.

## Running it

```bash
./build.sh master WORKTREE            # or any two refs; WORKTREE = the tree as-is
node drive.mjs plugins left leftA "none,schema,persistent"   # A/A floor FIRST
node drive.mjs plugins left right  "none,schema,persistent"  # then the delta
node drive.mjs core    left right  "buildPath-static,isActiveRoute-exact,navigate"
```

`build.sh` never touches the working tree: each side is materialised with
`git archive` into `out/`, and the entry files are copied INTO that tree so
esbuild's aliases resolve against it.

⚠ **Read the A/A floor first, on the same arms, in the same sitting.** This rig
has produced deltas that flipped sign between two runs of one pair. The floor
here runs ±0.5–1.7 %; a delta inside it is not a direction.

⚠ **One copy of core per process.** The `@real-router/core*` aliases in
`build.sh` are load-bearing: without them the plugin packages resolve their own
copy, the internals `WeakMap` stops matching, and every router fails with
`Invalid router instance` — the dual-package trap, arriving as a wrong error
rather than a wrong number.

⚠ **zod comes from `benchmarks/node_modules`**, the only workspace that depends
on it. The schema is three optional keys — a floor, not a worst case. Re-measure
against the application's own schema before quoting the figure.

## What was recorded, 2026-09-02, master `7f35fd8cc`

`router.buildPath("list", {}, { q, page })`, master vs the O-1b prototype
(the `forwardState` chain also running at the `router.buildPath` door,
⑤a un-wired from the interceptable). A/A floor ±0.7 %.

| installed | master | O-1b | Δ |
| --- | ---: | ---: | ---: |
| nothing | 511.8 ns | 504.3 | −1.5 % |
| `persistent-params` | 980.3 | 973.4 | −0.7 % |
| `search-schema` (zod) | 521.2 | 874.3 | **+67.7 %** |
| both | 976.7 | 1282.8 | +31.3 % |

Two readings, and both are needed. `persistent-params` sits in the floor —
for it the move is a MOVE: it already hangs on that door today. `search-schema`
is where the new work lands, because it runs `forwardState` and that seam does
not reach `router.buildPath` on master. +353 ns per href; a hundred `<Link>`s
per render is 35 µs, i.e. 0.2 % of a 16 ms frame — dramatic relatively, modest
absolutely, and a report that quotes one without the other is misleading.

Core-only arms over the same pair, A/A floor 1–3 %: every arm inside the floor,
`navigate` −1.4 %. The variant that puts the seam inside `canonicalize`'s
literal branch — so `isActiveRoute` and `makeState` get it too — costs
**+9.3 % on `isActiveRoute-exact`** against a 1.0 % floor, and is disqualified by
that number alone: the seam belongs at the DOOR.

The mandatory `normalizeChannel(search)` at the door — #1849 travels with the
seam once it sits above `canonicalize` — costs +11.1 % bare and +8.0 % with the
schema. It is avoidable: normalise inside the seam's non-empty branch instead,
and a router with no interceptor registered pays nothing while the guarantee
holds, because with an empty chain nobody sees the bag.

## Files

```
build.sh           two refs → four bundles in out/, plus an A/A copy
entry-core.ts      core surface only
entry-plugins.ts   core + search-schema + persistent-params, ONE copy of core
bench-core.mjs     render-path and navigate arms over core alone
bench-plugins.mjs  router.buildPath with the real plugins — the deciding arm
drive.mjs          alternating processes, medians, order flipped per pair
```

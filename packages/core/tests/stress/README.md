# Core stress tests — discriminating-power conventions

These tests guard memory, concurrency, and scaling. **Coverage does not measure
their discriminating power** — a stress test can pass while the behavior it
claims to guard is fully broken ("theatre"). Every assert here must fail when the
thing it guards breaks. This file records the conventions that keep that true;
see the root `CLAUDE.md` bullet "Heap-threshold stress tests MUST have proven
discriminating power" for the canonical statement.

## Assert taxonomy

| Type | What it is | Rule |
| --- | --- | --- |
| **HEAP-THRESHOLD** | `expect(delta).toBeLessThan(N)` on `takeHeapSnapshot()` | Only legitimate as a **leak detector** when the leak is reachable AND the signal clears noise — otherwise it is a **throughput guard** and must say so. |
| **COUNT / `has`** | listener/entry/guard count or membership after churn | Preferred discriminator for bounded structures. Tighten to `===` exact values. |
| **CONCURRENCY** | invariant after a race | Assert an exact post-condition (final state, exact cancel count), not `> 0`. |
| **TIMING wall-clock** | `measureTime` + `< X ms` | Keep only at catastrophe-guard margin (≥~100×). Tight margins flake → convert to op-count or delete. |
| **TIMING fake-timer** | `vi.useFakeTimers()` | Deterministic — leave alone. |

## Heap-threshold: the three structural traps

A heap snapshot **cannot** discriminate a leak in these shapes — do not pretend it
can. Use a count/`has` invariant or relabel honestly as a throughput guard.

- **GC-masking** — a `create → drop` loop (new router/clone/closure per iteration,
  reference dropped). The per-cycle object is unreachable and reclaimed
  regardless of whether cleanup ran, so the snapshot is blind. *Fix:* assert a
  functional invariant on each cycle (it navigated / disposed-then-throws / clone
  isolated) and keep the heap line only as a throughput ceiling.
- **Hard-cap** — the structure is bounded: `WeakMap` one-per-router, guard storage
  `Map<routeName>` last-add-wins, rootPath/tree last-write-wins. Max possible leak
  sits below the threshold by construction. *Fix:* drop the heap line, assert the
  count/`has` invariant (e.g. storage empty after remove-all).
- **N-too-low** — the leak is reachable (persistent router) but the signal stays in
  KB, under the ~100–300 KB inter-test noise floor. *Fix:* raise N until the leak
  clears healthy by ≥3× (see the S5.3 model), or relabel as throughput.

## Model tests (genuinely discriminating heap — DO NOT weaken)

Mutationally validated, with `// healthy / leak / threshold` anchored in-comment:

- `guards-stress.stress.ts` **S5.3** — StateNamespace retain-all leak, N=20k:
  healthy ~0.48 MB, leak ~7.0 MB, threshold 2 MB.
- `tree-changed.stress.ts` **releases handler refs** — subscribeChanges unsubscribe,
  N=50k: healthy ~0, leak ~9 MB, threshold 1 MB.
- `dependencies-store.stress.ts` **S13.4** — reset-clears leak (escapes the cap via
  `maxDependencies: 0`, N=2k): healthy ≤~60 KB, leak ~9 MB, threshold 1 MB.
- `plugin-lifecycle-memory.stress.ts` **addInterceptor** — interceptor-chain leak,
  N=3k: healthy ~106 KB, leak ~1.7 MB, threshold 0.5 MB.
- `event-listener-memory.stress.ts` **S2.1** — listener add/remove, N=9k:
  healthy ~36 KB, leak ~1.6 MB, threshold 0.5 MB.

## Rules when adding / changing a stress test

1. Every retained HEAP-THRESHOLD that claims to detect a leak MUST carry a
   `// healthy: X / leak: Y / threshold: Z (≥3x both sides)` comment, anchored to a
   **measured** healthy delta — never a round-MB guess. Validate by simulating the
   exact leak and confirming the gate trips.
2. If the leak is GC-masked / hard-capped, do NOT keep a leak-claiming heap assert.
   Use a count/`has`/functional invariant; a heap line may remain only as a
   throughput ceiling, explicitly labelled.
3. Keep test titles truthful — no "heap"/"leak" wording on a throughput guard.
4. Prefer exact `===` over `> 0` / `>= N` / `toBeDefined()`; the latter pass when
   behavior is broken.
5. If a strengthened assert fails on correct code, you have probably found a real
   bug — stop and report it, do not weaken the assert to hide it.

## How to measure (probe pattern)

To anchor a heap threshold, run the scenario twice — healthy vs. the simulated
leak — and read both deltas (a throwaway probe with the value in the assertion
message prints it):

```ts
expect(delta, `HEALTHY=${formatBytes(delta)}`).toBeLessThan(1); // forces a print
```

Run heap tests **serially** (`pnpm -F @real-router/core test:stress`) — parallel
CPU contention adds jitter that corrupts the snapshot.

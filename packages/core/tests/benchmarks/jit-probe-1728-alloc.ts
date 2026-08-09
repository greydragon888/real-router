/**
 * #1728 — allocation probe: NAME the allocation that crosses the step.
 *
 * WHAT IS ALREADY KNOWN (see `packages/core/.claude/research/
 * rfc-1728-navigate-syscall-step-2026-08-09.md`). Any edit adding TWO OR MORE
 * statements to `beginTransition` — statements that read nothing and write
 * nothing — costs +15.5 % on `navigate/sync-baseline` and flips CodSpeed's
 * `sysCount` from 13 to 22. One statement is free. The component that moves
 * hardest is `memoryAccess` (+40.7 %), and +9 syscalls with no `sysSeconds`
 * move is the signature of a process asking the OS for pages. This probe is
 * the next question: WHICH allocation.
 *
 * WHY THE SHAPE IS COPIED SO LITERALLY. The step lives in ONE measured window,
 * not in steady state — `@codspeed/tinybench-plugin` instruments a single task
 * invocation (7 deterministic warmup calls → `global.gc()` → one measured
 * call), and `navigate/sync-baseline` is `batched(512)`. A steady-state loop
 * over 400 k navigations (`jit-probe-1728.ts`, the sibling) averages the step
 * away — which is exactly why every instrument in that probe came back empty.
 * So this one reproduces the window: same batch size, same warmup count, same
 * pre-measure `gc()`, and it reads the heap on BOTH sides of it.
 *
 * ⚠ `fixtures.ts` already names the mechanism this is hunting: "a full GC
 * leaves tails: page unmapping (`madvise`/`munmap`) and finalization land on
 * the NEXT macrotask boundaries — i.e. inside the first measured iterations
 * when the collection is triggered by the plugin's own pre-measure
 * `global.gc()`". That is a hypothesis with a home, not a guess: if the slow
 * shape allocates enough more to lengthen that tail, the extra syscalls land
 * INSIDE the window and the fast shape's do not.
 *
 * MARKERS. Each window is bracketed by a `readlink()` of a path that does not
 * exist, whose name carries the window index. `readlink` is a real syscall
 * with a verbatim string argument, so `strace` prints the boundary in the raw
 * trace and no timestamp correlation is needed. `ENOENT` is the expected
 * outcome — making the call is the entire point. Nothing else runs between the
 * opening marker and the first navigation: the stderr notes (themselves
 * `write` syscalls) are deliberately printed OUTSIDE the bracket, before the
 * opening marker and after the closing one.
 *
 * WINDOW 0 IS THE ONE THAT MATCHES. It is the only one preceded by exactly the
 * plugin's history; windows 1..N-1 run against a heap the earlier windows
 * already grew and serve as a stability control — a difference that shows up
 * in window 0 alone is a first-touch cost, one that repeats is structural.
 *
 * ⚠ Run it where the effect lives — the self-hosted `Linux X64` runner. The
 * dev machines here are `arm64` / Darwin, where the step does not reproduce,
 * and `strace` is Linux-only regardless. See `.github/workflows/
 * perf-probe-1728.yml`.
 */
import { readlinkSync } from "node:fs";
import { setImmediate as nextTask } from "node:timers/promises";
import { getHeapSpaceStatistics } from "node:v8";

import { createRouter } from "../../src";

// argv rather than env: an env var read from a linted file has to be declared
// in the root `turbo.json`, and a throwaway probe has no business in the build
// graph's cache key.
const BATCH = Number(process.argv[2] ?? 512);
const WARMUP_CALLS = Number(process.argv[3] ?? 7);
const WINDOWS = Number(process.argv[4] ?? 5);

const gc = (globalThis as { gc?: () => void }).gc;

/**
 * A syscall whose argument is a unique, greppable string. The path is under
 * `/proc/self` so it can never accidentally exist.
 */
function mark(label: string): void {
  try {
    readlinkSync(`/proc/self/RR-1728-${label}`);
  } catch {
    // ENOENT — expected, and irrelevant. The syscall is the signal.
  }
}

/** Printed OUTSIDE the marker bracket, so its own `write` never lands inside. */
function note(text: string): void {
  process.stderr.write(`${text}\n`);
}

interface SpaceStats {
  readonly reserved: number;
  readonly used: number;
  readonly available: number;
  readonly physical: number;
}

interface Snapshot {
  readonly rss: number;
  readonly heapUsed: number;
  readonly external: number;
  readonly spaces: ReadonlyMap<string, SpaceStats>;
}

function snapshot(): Snapshot {
  const memory = process.memoryUsage();
  const spaces = new Map<string, SpaceStats>();

  for (const space of getHeapSpaceStatistics()) {
    spaces.set(space.space_name, {
      reserved: space.space_size,
      used: space.space_used_size,
      available: space.space_available_size,
      physical: space.physical_space_size,
    });
  }

  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    spaces,
  };
}

function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}K`;
}

const EMPTY_SPACE: SpaceStats = {
  reserved: 0,
  used: 0,
  available: 0,
  physical: 0,
};

/**
 * ⚑ `used` is what answers the GC question, and it is why every space is
 * printed rather than only the ones whose RESERVATION moved. The batch
 * allocates a known amount; if `new_space.used` comes out of the window LOWER
 * than it went in — or merely far below `before + allocated` — a scavenge ran
 * INSIDE the measured window, which is the event `fixtures.ts` describes and
 * the one that would carry both the syscalls and the `memoryAccess` column.
 * `available` is printed beside it because "how much room was left when the
 * window opened" is the whole question for a step that one extra statement
 * per navigation is enough to cross.
 */
function reportDelta(window: number, before: Snapshot, after: Snapshot): void {
  note(`[window ${window}] across the measured batch of ${BATCH}:`);
  note(
    `  rss ${kib(after.rss - before.rss)}   ` +
      `heapUsed ${kib(after.heapUsed - before.heapUsed)}   ` +
      `external ${kib(after.external - before.external)}`,
  );

  for (const [name, now] of after.spaces) {
    const was = before.spaces.get(name) ?? EMPTY_SPACE;

    if (
      now.reserved === was.reserved &&
      now.used === was.used &&
      now.physical === was.physical
    ) {
      continue;
    }

    note(
      `  ${name.padEnd(20)}` +
        ` used ${kib(now.used - was.used).padStart(9)}` +
        ` reserved ${kib(now.reserved - was.reserved).padStart(9)}` +
        ` physical ${kib(now.physical - was.physical).padStart(9)}` +
        `  |  entered used=${kib(was.used)} avail=${kib(was.available)}` +
        ` reserved=${kib(was.reserved)}`,
    );
  }
}

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "users", path: "/users" },
  ]);

  await router.start("/");

  const targets = ["about", "users", "home"] as const;
  let i = 0;

  const batch = (): void => {
    for (let k = 0; k < BATCH; k++) {
      void router.navigate(targets[i++ % targets.length]);
    }
  };

  // `settleHeap()` from fixtures.ts: two gc→drain rounds retire the startup
  // debt outside any window, the second collecting what the first's finalizers
  // released. Skipping this is how the tsx-compile garbage ends up attributed
  // to window 0.
  if (gc) {
    for (let round = 0; round < 2; round++) {
      gc();
      await nextTask();
    }
  }

  // The plugin's deterministic warmup calls.
  for (let w = 0; w < WARMUP_CALLS; w++) {
    batch();
    await nextTask();
  }

  for (let w = 0; w < WINDOWS; w++) {
    // The plugin's pre-measure collection, immediately before the measured
    // call and with NO macrotask boundary in between — the tails this leaves
    // are precisely what may land inside the window.
    gc?.();

    const before = snapshot();

    note(`[mark] W${w} BEGIN`);
    mark(`W${w}-BEGIN`);

    batch();

    mark(`W${w}-END`);
    note(`[mark] W${w} END`);

    reportDelta(w, before, snapshot());

    await nextTask();
  }

  note(
    `[probe] state=${router.getState()?.name} windows=${WINDOWS} batch=${BATCH}`,
  );
}

// Not top-level `await`: the package is CJS, so esbuild refuses it.
void main();

// CANNOT-AFFORD cell for the pending-shell family — a measurement, not an
// opinion. Strategy (а) at this door means: the object application code holds
// during the hooks is NOT the object the table commits. The cheapest shape is
// one extra 6-field State literal + one `Object.freeze` per navigation (the
// commit builds its own record instead of freezing the handed-out shell in
// place). Measured here:
//
//   1. `navigate` on the guard-free, listener-free arc (cut A) — the #307 hot
//      path, the floor everything is compared against;
//   2. the same arc plus the copy the (а) shape would add, done OUTSIDE core
//      (src is read-only in phase 0), on the state the navigation returned;
//   3. the copy alone.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/pending-shell-handouts/copy-cost.ts
import { bench, do_not_optimize, run } from "mitata";

import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

const freeze = Object.freeze;

function copyShell(s: State): State {
  return freeze({
    name: s.name,
    params: s.params,
    search: s.search,
    path: s.path,
    context: s.context,
    transition: s.transition,
  });
}

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ] as never,
    {} as never,
  );

  await router.start("/a");

  let flip = false;
  const next = (): string => {
    flip = !flip;

    return flip ? "b" : "a";
  };

  // Sync arc: `navigate` returns a Promise from the facade but the pipeline
  // settled synchronously (cut A) — `getState()` already moved when it returns.
  bench("navigate cut A (baseline)", () => {
    void router.navigate(next());
    do_not_optimize(router.getState());
  });

  bench("navigate cut A + copyShell(getState()) [the (а) shape, outside core]", () => {
    void router.navigate(next());
    do_not_optimize(copyShell(router.getState()!));
  });

  const sample = router.getState()!;

  bench("copyShell alone (6-field literal + freeze)", () => {
    do_not_optimize(copyShell(sample));
  });

  await run();
}

void main();

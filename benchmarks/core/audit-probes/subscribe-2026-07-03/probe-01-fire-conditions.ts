// probe-01: subscribe fire-condition matrix against the CURRENT emit topology.
//
// Since the 2026-05-22 baseline the TRANSITION_SUCCESS emit points changed:
// (1) completeTransition → sendComplete (classic), (2) navigateToNotFound →
// direct emitTransitionSuccess (NavigationNamespace.ts:270), and NEW
// (3) getRoutesApi().replace() revalidation (#950) → internals
// emitTransitionSuccess / navigateToNotFound. The prompt only knows (1)+(2).
//
// Contract: CLAUDE.md "Atomic Route Replacement: replace()" step 6 (#950) —
// subscribers ARE notified after replace; clear() stays a silent reset.
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

void (async () => {
  const mk = () =>
    createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      {
        name: "blocked",
        path: "/blocked",
        canActivate: () => () => false,
      },
    ]);

  // --- 1. start() fires, previousRoute === undefined ---
  {
    const r = mk();
    const calls: string[] = [];

    r.subscribe(({ route, previousRoute }) => {
      calls.push(`${route.name}|prev=${String(previousRoute?.name)}`);
    });
    await r.start("/");
    console.log(`1. start() fires: ${JSON.stringify(calls)} (expect home|prev=undefined)`);
  }

  // --- 2. rejection matrix: no fire on any reject code ---
  {
    const r = mk();

    await r.start("/");

    let fires = 0;

    r.subscribe(() => {
      fires++;
    });

    const outcomes: string[] = [];

    for (const attempt of [
      () => r.navigate("home"), // SAME_STATES
      () => r.navigate("missing"), // ROUTE_NOT_FOUND
      () => r.navigate("blocked"), // CANNOT_ACTIVATE
    ]) {
      outcomes.push(
        await attempt().then(
          (s) => `resolved:${s.name}`,
          (e: { code?: string }) => `rejected:${e.code}`,
        ),
      );
    }

    console.log(`2. rejects: ${JSON.stringify(outcomes)} fires=${fires} (expect 0)`);
  }

  // --- 3. navigateToNotFound fires ---
  {
    const r = mk();

    await r.start("/");

    const calls: string[] = [];

    r.subscribe(({ route }) => calls.push(route.name));
    r.navigateToNotFound("/nope");
    console.log(`3. navigateToNotFound fires: ${JSON.stringify(calls)}`);
  }

  // --- 4. replace() revalidation fires (#950) — path still matches ---
  {
    const r = mk();

    await r.start("/about");

    const calls: string[] = [];

    r.subscribe(({ route, previousRoute }) =>
      calls.push(`${route.name}|prev=${String(previousRoute?.name)}`),
    );
    getRoutesApi(r).replace([
      { name: "about", path: "/about" },
      { name: "other", path: "/other" },
    ]);
    console.log(`4. replace() revalidation fires: ${JSON.stringify(calls)}`);
  }

  // --- 5. replace() drops active route → UNKNOWN_ROUTE commit fires ---
  {
    const r = mk();

    await r.start("/about");

    const calls: string[] = [];

    r.subscribe(({ route }) => calls.push(route.name));
    getRoutesApi(r).replace([{ name: "solo", path: "/solo" }]);
    console.log(
      `5. replace() drop→UNKNOWN fires: ${JSON.stringify(calls)} state=${r.getState()?.name}`,
    );
  }

  // --- 6. clear() is silent (no fire) ---
  {
    const r = mk();

    await r.start("/");

    let fires = 0;

    r.subscribe(() => {
      fires++;
    });
    getRoutesApi(r).clear();
    console.log(`6. clear() silent: fires=${fires} (expect 0) state=${String(r.getState()?.name)}`);
  }
})();

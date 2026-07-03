// probe-04: the two NO_FIRE reject codes with ZERO subscribe-surface coverage
// (test inventory 2026-07-03): TRANSITION_CANCELLED (supersede) and
// CANNOT_DEACTIVATE. Verifies the behaviour is correct (no fire → pure
// Test-gap, not a hidden bug).
//
// Contract: CLAUDE.md — subscribe fires on TRANSITION_SUCCESS only.
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";

void (async () => {
  // --- 1. TRANSITION_CANCELLED via supersede: only the winner fires ---
  {
    const r = createRouter([
      { name: "home", path: "/" },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => () =>
          new Promise<boolean>((res) => setTimeout(() => res(true), 30)),
      },
      { name: "fast", path: "/fast" },
    ]);

    await r.start("/");

    const fired: string[] = [];

    r.subscribe(({ route }) => fired.push(route.name));

    const slowNav = r.navigate("slow").then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );
    const fastNav = r.navigate("fast").then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );

    console.log(`1. supersede: slow=${await slowNav} fast=${await fastNav}`);
    console.log(
      `   fired=${JSON.stringify(fired)} (expect only ["fast"] — no fire for the cancelled one)`,
    );
  }

  // --- 2. CANNOT_DEACTIVATE: blocking deactivate guard → no fire ---
  {
    const r = createRouter([
      { name: "home", path: "/" },
      {
        name: "locked",
        path: "/locked",
        canDeactivate: () => () => false,
      },
      { name: "other", path: "/other" },
    ]);

    await r.start("/");
    await r.navigate("locked");

    const fired: string[] = [];

    r.subscribe(({ route }) => fired.push(route.name));

    const out = await r.navigate("other").then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );

    console.log(`2. CANNOT_DEACTIVATE: navigate=${out} fired=${JSON.stringify(fired)} (expect [])`);
  }
})();

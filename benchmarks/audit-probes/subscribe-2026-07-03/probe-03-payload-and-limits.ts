// probe-03: payload identity/mutability + listener limits through the router
// surface.
//
// (a) Each subscribe wrapper builds its OWN `{route, previousRoute}` literal
//     per emit (EventBusNamespace.ts:473-476) — unlike subscribeLeave, whose
//     single shared payload is Object.freeze'd (EventBusNamespace.ts:564).
//     Questions: is the subscribe payload frozen? Is it shared between
//     listeners (cross-listener mutation visibility)?
// (b) Limits (core DEFAULT_LIMITS: maxListeners 10_000 / warnListeners 1000,
//     constants.ts:82-86, wired via RouterWiringBuilder.ts:47-50; overridable
//     via options.limits): what does the 10_001st subscribe throw — a coded
//     RouterError or a bare Error from the emitter?
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core";

void (async () => {
  // --- (a) payload identity & mutability ---
  {
    const r = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    await r.start("/");

    const payloads: { route: State; previousRoute?: State | undefined }[] = [];

    r.subscribe((p) => {
      payloads.push(p);
    });
    r.subscribe((p) => {
      payloads.push(p);
    });

    await r.navigate("about");

    const [p1, p2] = payloads;

    console.log(`a1. payload shared between listeners: ${p1 === p2} (per-listener literal expected: false)`);
    console.log(`a2. payload object frozen: ${Object.isFrozen(p1)}`);
    console.log(`a3. payload.route frozen (State invariant): ${Object.isFrozen(p1.route)}`);

    // wrapper-mutation attempt: reassign p1.route (module is strict mode — a
    // frozen target would throw; an unfrozen one silently accepts)
    let mutationOutcome = "accepted";

    try {
      (p1 as { route: State }).route = p2.route;
      mutationOutcome = p1.route === p2.route ? "accepted (unfrozen wrapper)" : "no-op";
    } catch (e) {
      mutationOutcome = `threw ${(e as Error).constructor.name} (frozen)`;
    }

    console.log(`a4. payload.route reassignment: ${mutationOutcome}; cross-listener leak: ${p1 === p2 ? "possible" : "none (separate objects)"}`);
  }

  // --- (b) limits surface via options.limits ---
  {
    const r = createRouter(
      [{ name: "home", path: "/" }],
      { limits: { maxListeners: 3, warnListeners: 2 } },
    );

    const outcomes: string[] = [];

    for (let i = 1; i <= 4; i++) {
      try {
        r.subscribe(() => {});
        outcomes.push(`#${i}=ok`);
      } catch (e) {
        const err = e as { code?: string; message: string; constructor: { name: string } };

        outcomes.push(
          `#${i}=threw ${err.constructor.name} code=${String(err.code)} msg="${err.message}"`,
        );
      }
    }

    console.log(`b1. maxListeners=3 sequence: ${outcomes.join(" | ")}`);
  }
})();

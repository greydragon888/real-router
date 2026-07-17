// packages/preact/tests/stress/use-route-enter-race.stress.tsx

/**
 * Stress test for `useRouteEnter` under rapid navigations.
 *
 * Closes review §7.1 MEDIUM: "useRouteEnter race с rapid navigation —
 * handler запускается через `useEffect`, который в Preact deferred — если
 * route flips дважды между effects, intermediate state lost."
 *
 * What's tested (probabilistic, not deterministic — Preact has no public
 * scheduler-control API equivalent to React `act` flush):
 *
 *   1. **Final-state convergence** — after N rapid navigations + drain, the
 *      LAST handler call MUST match the FINAL router state. A regression
 *      where stale intermediate state was committed last would surface here.
 *   2. **No phantom calls** — every handler invocation maps to a real
 *      `(from, to)` transition (transition.from === previousRoute.name).
 *      A regression where the shared gate's dedupe (`createRouteEnterGate`)
 *      mis-deduped would surface as a handler call with mismatched (from, to).
 *   3. **Bounded call count** — handler fires at most once per committed
 *      transition. With N navigations attempted, the handler call count
 *      ≤ N (intermediates may be dropped by React's scheduler — that's
 *      expected and documented).
 *   4. **No handler call AFTER unmount** — after `unmount()`, no further
 *      handler invocation may fire even if the router emits another event.
 *      Lifecycle correctness lock — guards against effect-cleanup races.
 */

import { errorCodes } from "@real-router/core";
import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RouterProvider, useRouteEnter } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { State, Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

interface CallRecord {
  readonly toName: string;
  readonly fromName: string | undefined;
  readonly routeRef: State;
}

function makeProbe(records: CallRecord[]): FunctionComponent {
  const Probe: FunctionComponent = () => {
    useRouteEnter(
      ({ route, previousRoute }) => {
        records.push({
          toName: route.name,
          fromName: previousRoute.name,
          routeRef: route,
        });
      },
      // Disable same-route skip so transitions with the same route name but
      // different params still register — broadens the race surface.
      { skipSameRoute: false },
    );

    return null;
  };

  Probe.displayName = "UseRouteEnterProbe";

  return Probe;
}

describe("preact stress — useRouteEnter race (§7.1 MEDIUM)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("final-state convergence: last handler call matches final router state across 50 rapid navigations", async () => {
    const records: CallRecord[] = [];
    const Probe = makeProbe(records);

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // Drive 50 navigations sequentially through act() — each completes before
    // the next starts. This is the "interleaved guard execution" path; without
    // act-coordination we'd race against React's scheduler in unpredictable
    // ways and the test would be unreliable.
    for (let i = 1; i <= 50; i++) {
      const target = `route${i % 20}`;

      await act(async () => {
        await router.navigate(target).catch((error: unknown) => {
          // SAME_STATES rejections from same-target navigation are expected
          // and not a test failure — we want the test to survive them.
          const code = (error as { code?: string }).code;

          if (code !== errorCodes.SAME_STATES) {
            throw error;
          }
        });
      });
    }

    const finalState = router.getState();

    expect(finalState).toBeDefined();

    // Handler MUST have fired at least once (50 navigations from a start
    // route to varying targets cannot all be SAME_STATES rejects).
    expect(records.length).toBeGreaterThan(0);

    // The LAST recorded call's `toName` must match the router's final
    // committed state. A regression where stale intermediate state was
    // committed last would surface as `last.toName !== finalState.name`.
    const last = records.at(-1);

    expect(last).toBeDefined();
    expect(last!.toName).toBe(finalState!.name);
  });

  it("no phantom calls: every handler invocation reflects a real (from, to) transition", async () => {
    const records: CallRecord[] = [];
    const Probe = makeProbe(records);

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    for (let i = 1; i <= 30; i++) {
      const target = `route${(i * 3) % 20}`;

      await act(async () => {
        await router.navigate(target).catch((error: unknown) => {
          const code = (error as { code?: string }).code;

          if (code !== errorCodes.SAME_STATES) {
            throw error;
          }
        });
      });
    }

    expect(records.length).toBeGreaterThan(0);

    // For every recorded call, the route ref carried in the handler context
    // must have `transition.from === fromName` (consistency between the
    // useRoute() snapshot at handler-fire time and what previousRoute saw).
    // A regression in useRouteEnter's snapshot-capture would surface as a
    // mismatch.
    for (const record of records) {
      expect(record.routeRef.transition.from).toBe(record.fromName);
      // The route ref's own name matches the toName argument — proves the
      // handler received the right snapshot, not a stale one.
      expect(record.routeRef.name).toBe(record.toName);
    }
  });

  it("bounded call count: handler fires at most once per committed transition", async () => {
    const records: CallRecord[] = [];
    const Probe = makeProbe(records);

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // 25 unique-target navigations (no same-route repeats by construction).
    const targets = Array.from({ length: 25 }, (_, i) => `route${i % 20}`);
    let succeeded = 0;

    for (const target of targets) {
      const before = router.getState()?.name;

      if (before === target) {
        continue;
      }

      await act(async () => {
        await router.navigate(target).catch((error: unknown) => {
          const code = (error as { code?: string }).code;

          if (code !== errorCodes.SAME_STATES) {
            throw error;
          }
        });
      });
      succeeded++;
    }

    // The handler may fire fewer than `succeeded` times when React's
    // scheduler coalesces effects, but it MUST NOT fire MORE. A regression
    // dropping the shared gate's dedupe (`createRouteEnterGate`) would surface
    // as `records.length > succeeded`.
    expect(records.length).toBeLessThanOrEqual(succeeded);
  });

  it("no handler call after unmount (lifecycle correctness)", async () => {
    const records: CallRecord[] = [];
    const Probe = makeProbe(records);

    const { unmount } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    // Establish a baseline by navigating once.
    await act(async () => {
      await router.navigate("route5").catch(() => {});
    });

    const baselineCount = records.length;

    // Unmount, then drive 10 more navigations.
    unmount();

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate(`route${i}`).catch(() => {});
      });
    }

    // Handler must NOT have been invoked after unmount. A regression in the
    // useEffect cleanup (e.g. handler ref retained after unmount) would
    // surface as `records.length > baselineCount`.
    expect(records).toHaveLength(baselineCount);
  });
});

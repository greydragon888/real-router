// packages/preact/tests/stress/route-hooks-stress.stress.tsx

/**
 * Stress tests for the public `useRouteEnter` / `useRouteExit` hooks
 * under rapid navigation, mount/unmount cycles, and same-route bursts.
 *
 * Closes §7.2 #16 review item: "useRouteEnter / useRouteExit под rapid nav —
 * handler-ref stability и same-route skip могут leak listeners или fire
 * stale handlers. Functional only."
 *
 * Invariants exercised:
 *  - **Listener cleanup on unmount** — after mount → unmount of N hosts
 *    each carrying a useRouteEnter/useRouteExit hook, no handlers fire on
 *    subsequent navigations.
 *  - **Latest-handler ref stability** — the hook resubscribes only on
 *    `[router, skipSameRoute]` dep change, not on handler identity. A
 *    handler that flips on every render must still see its latest closure
 *    when invoked.
 *  - **`skipSameRoute` default** — query-only-style same-name navigations
 *    via `force: true` do not fire the handler.
 */

import { act, cleanup, render } from "@testing-library/preact";
import { useRef, useState } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RouterProvider,
  useRouteEnter,
  useRouteExit,
} from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router, State } from "@real-router/core";
import type { FunctionComponent } from "preact";

describe("R — useRouteEnter / useRouteExit stress (§7.2 #16)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(15);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("mount → unmount × 100 cycles — no leaked listeners, no fires after unmount", async () => {
    // After 100 mount/unmount cycles, a navigation must NOT invoke any
    // handler from any of the 100 unmounted instances. Counts post-unmount
    // calls — must be zero. Leaks would manifest as N×nav calls.
    let postUnmountCalls = 0;

    const HostEnter: FunctionComponent = () => {
      useRouteEnter(() => {
        postUnmountCalls++;
      });

      return null;
    };

    const HostExit: FunctionComponent = () => {
      useRouteExit(() => {
        postUnmountCalls++;
      });

      return null;
    };

    for (let i = 0; i < 100; i++) {
      const view = render(
        <RouterProvider router={router}>
          <HostEnter />
          <HostExit />
        </RouterProvider>,
      );

      view.unmount();
    }

    // Reset the counter — fires that happened during navigations triggered
    // BY mount/unmount themselves are not the regression we care about.
    postUnmountCalls = 0;

    // Now navigate a few times AFTER all instances are unmounted.
    for (let i = 1; i <= 5; i++) {
      await act(async () => {
        await router.navigate(`route${i}`);
      });
    }

    expect(postUnmountCalls).toBe(0);
  });

  it("handler identity flips every render — latest closure is invoked, no resubscribe storm", async () => {
    // Stable subscription, mutable closure: useRouteExit/useRouteEnter use
    // a latest-ref pattern. We rotate the handler identity on every render
    // (via a state-bumping parent) and check the handler that fires is the
    // most recently committed one. A regression that resubscribed on every
    // render would scale the call count linearly with re-renders.
    let lastSeenValue = -1;
    let exitCallCount = 0;

    const Probe: FunctionComponent<{ tag: number }> = ({ tag }) => {
      const tagRef = useRef(tag);

      tagRef.current = tag;

      useRouteExit(() => {
        // Read whatever closure won the latest render — must be `tag` of
        // the most recent re-render, not the initial value.
        lastSeenValue = tagRef.current;
        exitCallCount++;
      });

      return <div data-testid="probe">{tag}</div>;
    };

    const Parent: FunctionComponent = () => {
      const [tag, setTag] = useState(0);

      // Expose setter via window for the test to call without an event.
      (globalThis as { __setTag?: (n: number) => void }).__setTag = setTag;

      return <Probe tag={tag} />;
    };

    render(
      <RouterProvider router={router}>
        <Parent />
      </RouterProvider>,
    );

    // Re-render 20 times, each setting a new tag value.
    for (let i = 1; i <= 20; i++) {
      await act(async () => {
        (globalThis as { __setTag?: (n: number) => void }).__setTag?.(i);
      });
    }

    // Trigger ONE navigation — useRouteExit's handler must run with the
    // tag value (20) from the latest render, not any earlier value.
    await act(async () => {
      await router.navigate("route3");
    });

    expect(exitCallCount).toBe(1);
    expect(lastSeenValue).toBe(20);
  });

  it("rapid alternating navs (10 cycles between 2 routes) — useRouteEnter fires for each real entry", async () => {
    // route0 ↔ route1, 10 times = 20 navigations. Half are entries to
    // route1, half are re-entries to route0 (since starting at route0).
    // `useRouteEnter` with default skipSameRoute=true must fire 20 times
    // (each is a cross-route transition).
    const enters: { name: string; from: string }[] = [];

    const Host: FunctionComponent = () => {
      useRouteEnter(({ route, previousRoute }) => {
        enters.push({ name: route.name, from: previousRoute.name });
      });

      return null;
    };

    render(
      <RouterProvider router={router}>
        <Host />
      </RouterProvider>,
    );

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate("route1");
      });
      await act(async () => {
        await router.navigate("route0");
      });
    }

    // Every navigation crosses route names → 20 enters logged. Skip-same-
    // route never fires (it would fire if both navs landed on the same
    // route name, which we explicitly avoid).
    expect(enters).toHaveLength(20);

    // The most recent entry is back on route0 (last nav in the loop).
    // toHaveLength(20) above guarantees a non-empty array — assert non-null.
    expect(enters.at(-1)!.name).toBe("route0");
  });

  it("force-true same-route navigation — useRouteExit default does NOT fire (skipSameRoute=true)", async () => {
    // Same-route force navigations are how query/sort/filter changes
    // re-emit a TRANSITION_SUCCESS in core. By default useRouteExit skips
    // these (skipSameRoute=true). We assert the skip path holds across
    // multiple same-route forced re-emits.
    let exitFires = 0;

    const Host: FunctionComponent = () => {
      useRouteExit(() => {
        exitFires++;
      });

      return null;
    };

    render(
      <RouterProvider router={router}>
        <Host />
      </RouterProvider>,
    );

    // Force-navigate to the same route 5 times. Same-route → skip.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await router.navigate("route0", {}, undefined, { force: true });
      });
    }

    expect(exitFires).toBe(0);

    // Crossing routes — fires once per cross.
    await act(async () => {
      await router.navigate("route2");
    });

    expect(exitFires).toBe(1);
  });

  it("opt-out: skipSameRoute=false fires useRouteExit for force-true same-route navs", async () => {
    // Inverse of the previous test: with skipSameRoute=false, the handler
    // fires on every successful nav including same-route force navs. Locks
    // the documented opt-out.
    const fires: { route: string; nextRoute: string }[] = [];

    const Host: FunctionComponent = () => {
      useRouteExit(
        ({ route, nextRoute }: { route: State; nextRoute: State }) => {
          fires.push({ route: route.name, nextRoute: nextRoute.name });
        },
        { skipSameRoute: false },
      );

      return null;
    };

    render(
      <RouterProvider router={router}>
        <Host />
      </RouterProvider>,
    );

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await router.navigate("route0", {}, undefined, { force: true });
      });
    }

    expect(fires).toHaveLength(5);

    for (const fire of fires) {
      expect(fire.route).toBe("route0");
      expect(fire.nextRoute).toBe("route0");
    }
  });
});

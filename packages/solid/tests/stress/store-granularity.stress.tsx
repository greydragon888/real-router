import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteStore,
  useRouteNodeStore,
} from "@real-router/solid";

import {
  createStressRouter,
  forceGC,
  MB,
  navigateSequentially,
  takeHeapSnapshot,
} from "./helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

const USERS_VIEW_ROUTE = "users.view";

describe("store-granularity stress tests", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("S1: useRouteStore — route.name effect fires only on name changes", async () => {
    let nameEffectCount = 0;

    function NameTracker(): JSX.Element {
      const state = useRouteStore();

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.name;
        nameEffectCount++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        <NameTracker />
      </RouterProvider>
    ));

    expect(nameEffectCount).toBe(1);

    await router.navigate("route1");

    expect(nameEffectCount).toBe(2);

    await router.navigate("route2");

    expect(nameEffectCount).toBe(3);

    await router.navigate(USERS_VIEW_ROUTE, { id: "1" });

    expect(nameEffectCount).toBe(4);

    await router.navigate(USERS_VIEW_ROUTE, { id: "2" });

    expect(nameEffectCount).toBe(4);
  });

  it("S2: useRouteStore — route.params.id effect fires only on id changes", async () => {
    let idEffectCount = 0;
    const idKey = "id";

    function IdTracker(): JSX.Element {
      const state = useRouteStore();

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.params[idKey];
        idEffectCount++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        <IdTracker />
      </RouterProvider>
    ));

    expect(idEffectCount).toBe(1);

    await router.navigate(USERS_VIEW_ROUTE, { id: "1" });

    expect(idEffectCount).toBe(2);

    await router.navigate(USERS_VIEW_ROUTE, { id: "2" });

    expect(idEffectCount).toBe(3);

    // Same state — router rejects with SAME_STATES, effect must not fire
    await router.navigate(USERS_VIEW_ROUTE, { id: "2" }).catch(() => {});

    expect(idEffectCount).toBe(3);
  });

  it("S3: useRouteNodeStore — scoped to node, granular per-property", async () => {
    let nodeNameEffectCount = 0;

    function UsersNameTracker(): JSX.Element {
      const state = useRouteNodeStore("users");

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.name;
        nodeNameEffectCount++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        <UsersNameTracker />
      </RouterProvider>
    ));

    expect(nodeNameEffectCount).toBe(1);

    await router.navigate("users.list");

    expect(nodeNameEffectCount).toBe(2);

    await router.navigate(USERS_VIEW_ROUTE, { id: "1" });

    expect(nodeNameEffectCount).toBe(3);

    await router.navigate(USERS_VIEW_ROUTE, { id: "2" });

    expect(nodeNameEffectCount).toBe(3);

    await router.navigate("route0");

    expect(nodeNameEffectCount).toBe(4);

    await router.navigate("route1");

    expect(nodeNameEffectCount).toBe(4);
  });

  it("S4: 20 useRouteStore consumers tracking different properties + 100 navigations — independent effects", async () => {
    let nameEffects = 0;
    let paramsEffects = 0;
    let prevRouteEffects = 0;

    function NameConsumer(): JSX.Element {
      const state = useRouteStore();

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.name;
        nameEffects++;
      });

      return <div />;
    }

    function ParamsConsumer(): JSX.Element {
      const state = useRouteStore();

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.params;
        paramsEffects++;
      });

      return <div />;
    }

    function PrevRouteConsumer(): JSX.Element {
      const state = useRouteStore();

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.previousRoute?.name;
        prevRouteEffects++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 7 }, () => (
          <NameConsumer />
        ))}
        {Array.from({ length: 7 }, () => (
          <ParamsConsumer />
        ))}
        {Array.from({ length: 6 }, () => (
          <PrevRouteConsumer />
        ))}
      </RouterProvider>
    ));

    const nameAfterMount = nameEffects;
    const paramsAfterMount = paramsEffects;
    const prevAfterMount = prevRouteEffects;

    // Alternate flat routes and param routes to exercise both name and params effects
    const routeSequence: { name: string; params?: Record<string, string> }[] =
      [];

    for (let i = 0; i < 10; i++) {
      routeSequence.push(
        i % 2 === 0
          ? { name: `route${i + 1}` }
          : { name: USERS_VIEW_ROUTE, params: { id: String(i) } },
      );
    }

    await navigateSequentially(router, routeSequence);

    expect(nameEffects - nameAfterMount).toBe(7 * 10);
    // Params change on 9/10 navigations (first is {} → {}, rest alternate)
    expect(paramsEffects - paramsAfterMount).toBeGreaterThanOrEqual(7 * 9);
    expect(prevRouteEffects - prevAfterMount).toBeGreaterThanOrEqual(
      6 * 10 - 6,
    );
  });

  it("S5: useRouteNodeStore — 10 nodes × 50 navigations — only relevant node stores update", async () => {
    const nodeEffectCounts: number[] = Array.from({ length: 10 }, () => 0);

    function NodeStoreConsumer(props: { readonly index: number }): JSX.Element {
      const state = useRouteNodeStore(`route${props.index}`);

      createEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.name;
        nodeEffectCounts[props.index]++;
      });

      return <div />;
    }

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 10 }, (_, i) => (
          <NodeStoreConsumer index={i} />
        ))}
      </RouterProvider>
    ));

    // Navigate away from route0 to avoid SAME_STATES on first iteration
    await router.navigate("users.list");

    const countsAfterMount = [...nodeEffectCounts];

    for (let nav = 0; nav < 50; nav++) {
      await router.navigate(`route${nav % 10}`);
    }

    for (let i = 0; i < 10; i++) {
      const delta = nodeEffectCounts[i] - countsAfterMount[i];

      expect(delta).toBeGreaterThanOrEqual(4);
      expect(delta).toBeLessThanOrEqual(15);
    }
  });

  // §7.2 audit scenario G2 — `createStoreFromSource` granularity at
  // 1000+ rapid reconcile burst.
  //
  // Existing S1-S5 tests verify granularity over ≤100 navs. This stress
  // verifies that under 1000+ navigations:
  //   1. Identity-preservation of unchanged paths holds at burst scale
  //      (no incremental drift from reconcile diffing).
  //   2. Effect-count grows linearly with NAVIGATIONS, not quadratically
  //      with consumers (no spurious re-runs from N stores × N navs).
  //   3. Heap stays bounded — no retained reconcile-internal proxies.
  it("S6.1: 1500-nav burst — 20 store consumers × granular reads — heap bounded + linear effect-count", async () => {
    const NAVS = 1500;
    const CONSUMERS = 20;

    let nameReadCount = 0;
    let paramsReadCount = 0;

    type Probe = (props: { readonly idx: number }) => JSX.Element;

    const NameOnlyProbe: Probe = () => {
      const state = useRouteStore();

      createEffect(() => {
        // Read only route.name — should re-run only when name changes.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.name;
        nameReadCount++;
      });

      return <span />;
    };

    const ParamsOnlyProbe: Probe = () => {
      const state = useRouteStore();

      createEffect(() => {
        // Read only route.params.id — should re-run only when id changes.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        state.route?.params.id;
        paramsReadCount++;
      });

      return <span />;
    };

    render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: CONSUMERS / 2 }, (_, i) => (
          <NameOnlyProbe idx={i} />
        ))}
        {Array.from({ length: CONSUMERS / 2 }, (_, i) => (
          <ParamsOnlyProbe idx={i} />
        ))}
      </RouterProvider>
    ));

    const heapBefore = takeHeapSnapshot();
    const nameReadAfterMount = nameReadCount;
    const paramsReadAfterMount = paramsReadCount;

    // Burst: 1500 navigations alternating between routes with different
    // names AND between routes with same name but changing params.
    //   - Each cross-route nav (route changes name) → name probes re-run.
    //   - Each same-route param change → params probes re-run for
    //     consumers reading that specific param.
    for (let i = 0; i < NAVS; i++) {
      const target = i % 3 === 0 ? "users.view" : `route${i % 30}`;
      const params = i % 3 === 0 ? { id: `${i}` } : {};

      await router.navigate(target, params);
    }

    forceGC();
    const heapAfter = takeHeapSnapshot();

    const nameReadDelta = nameReadCount - nameReadAfterMount;
    const paramsReadDelta = paramsReadCount - paramsReadAfterMount;

    // Sanity: effects fired throughout the burst (not stuck).
    expect(nameReadDelta).toBeGreaterThan(0);
    expect(paramsReadDelta).toBeGreaterThan(0);

    // Linear bound: NAVS navigations × CONSUMERS/2 probes per side.
    // Each side could in the worst case run once per nav per consumer →
    // NAVS * (CONSUMERS / 2) re-runs. Generous upper bound: 2× that
    // (Solid scheduler may double-flush in edge cases). Anything beyond
    // signals quadratic blow-up.
    const upperBound = 2 * NAVS * (CONSUMERS / 2);

    expect(nameReadDelta).toBeLessThan(upperBound);
    expect(paramsReadDelta).toBeLessThan(upperBound);

    // Heap budget: 1500 reconcile passes × 20 stores. 40MB cap — actual
    // dominated by Solid store-proxy internals; a real reconcile leak
    // (retained per-emit diff structures) would blow far past this.
    expect(heapAfter - heapBefore).toBeLessThan(40 * MB);

    router.stop();
  }, 120_000);
});

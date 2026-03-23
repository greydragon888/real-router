import { render } from "@solidjs/testing-library";
import { createEffect } from "solid-js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteStore,
  useRouteNodeStore,
} from "@real-router/solid";

import { createStressRouter, navigateSequentially } from "./helpers";

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
    const nodeEffectCounts: number[] = Array.from<number>({ length: 10 }).fill(
      0,
    );

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
});

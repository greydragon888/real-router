import { createRouteSource } from "@real-router/sources";
import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import UntrackedRouteReadersWithProvider from "../helpers/UntrackedRouteReadersWithProvider.svelte";

import type { RouteContext } from "../../src/types";
import type { Router } from "@real-router/core";

interface Readers {
  route: RouteContext;
  node: RouteContext;
}

interface Subscribable {
  subscribe: (listener: () => void) => () => void;
}

// Counts the live subscriptions made through `target.subscribe` from here on;
// a handle counts once, however often it is called. The hooks read a cached
// source's `subscribe` at render, so a counter set up before the first render
// sees each one, and a cell can show its source was disconnected while the
// router moved.
function countSubscriptions(target: Subscribable): () => number {
  const subscribe = target.subscribe.bind(target);
  let live = 0;

  target.subscribe = (listener) => {
    const unsubscribe = subscribe(listener);
    let active = true;

    live++;

    return () => {
      if (active) {
        active = false;
        live--;
      }

      unsubscribe();
    };
  };

  return () => live;
}

// `createSubscriber` subscribes only for a read made in a reactive context, so
// a `.current` read from an event handler or a plain function is a read with
// no listener on the source. It shows the route the router is on (#2909).
describe("a .current read outside a reactive context (#2909)", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  const mountReaders = (): Readers => {
    let readers: Readers | undefined;

    render(UntrackedRouteReadersWithProvider, {
      props: {
        router,
        nodeName: "users",
        onCapture: (captured: Readers) => {
          readers = captured;
        },
      },
    });
    flushSync();

    if (readers === undefined) {
      throw new Error("the fixture did not hand its readers out");
    }

    return readers;
  };

  it("useRoute shows the route the router moved to", async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();

    const routerSubscriptions = countSubscriptions(router);
    const { route } = mountReaders();

    expect(routerSubscriptions()).toBe(0);

    await router.navigate("about");

    expect(route.route.current?.name).toBe("about");

    const unsubscribe = createRouteSource(router).subscribe(() => {});

    expect(routerSubscriptions()).toBe(1);

    unsubscribe();

    expect(routerSubscriptions()).toBe(0);
  });

  it("useRouteNode shows the node route the router moved to", async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();

    const routerSubscriptions = countSubscriptions(router);
    const { node } = mountReaders();

    expect(node.route.current).toBeUndefined();
    expect(routerSubscriptions()).toBe(0);

    await router.navigate("users.list");

    expect(node.route.current?.name).toBe("users.list");

    const unsubscribe = createRouteSource(router).subscribe(() => {});

    expect(routerSubscriptions()).toBe(1);

    unsubscribe();

    expect(routerSubscriptions()).toBe(0);
  });
});

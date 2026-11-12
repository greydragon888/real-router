import { createRouter } from "@real-router/core";
import {
  createDismissableError,
  createRouteNodeSource,
} from "@real-router/sources";
import { act, render } from "@testing-library/preact";
import { useEffect, useState } from "preact/hooks";
import { afterEach, describe, expect, it } from "vitest";

import {
  RouteView,
  RouterErrorBoundary,
  RouterProvider,
} from "@real-router/preact";

import type { Router } from "@real-router/core";
import type { ComponentChildren } from "preact";

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

// The `useSyncExternalStore` polyfill seeds its state with `getSnapshot()`
// during render and subscribes in an effect. A component that mounts after a
// navigation it did not see must render the route the router is on, not the
// one its cached source held when the last subscriber left (#2909).
describe("remount after a navigation at zero subscribers (#2909)", () => {
  let router: Router | undefined;

  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  async function started(path: string): Promise<Router> {
    const instance = createRouter(
      [
        { name: "contacts", path: "/contacts" },
        { name: "cars", path: "/cars" },
        { name: "blocked", path: "/blocked", canActivate: () => () => false },
      ],
      { defaultRoute: "contacts" },
    );

    router = instance;
    await instance.start(path);

    return instance;
  }

  it("a remounted RouteView renders the current route first, and the previous route runs no effect", async () => {
    const instance = await started("/contacts");
    const log: string[] = [];

    function Page({ name }: { readonly name: string }): ComponentChildren {
      log.push(`render ${name}`);

      useEffect(() => {
        log.push(`effect ${name}`);
      }, [name]);

      return <p>{name}</p>;
    }

    let setShown: (shown: boolean) => void = () => {};

    function Host(): ComponentChildren {
      const [shown, set] = useState(true);

      setShown = set;

      return shown ? (
        <RouteView nodeName="">
          <RouteView.Match segment="contacts">
            <Page name="contacts" />
          </RouteView.Match>
          <RouteView.Match segment="cars">
            <Page name="cars" />
          </RouteView.Match>
        </RouteView>
      ) : null;
    }

    const nodeSubscriptions = countSubscriptions(
      createRouteNodeSource(instance, ""),
    );

    render(
      <RouterProvider router={instance}>
        <Host />
      </RouterProvider>,
    );

    expect(nodeSubscriptions()).toBeGreaterThan(0);

    await act(() => {
      setShown(false);
    });

    expect(nodeSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("cars");
    });
    log.length = 0;
    await act(() => {
      setShown(true);
    });

    expect(log).toStrictEqual(["render cars", "effect cars"]);
  });

  it("a remounted RouterErrorBoundary renders an error raised while it was unmounted on its first render", async () => {
    const instance = await started("/contacts");
    const log: string[] = [];

    function Child(): ComponentChildren {
      log.push("child");

      return null;
    }

    let setShown: (shown: boolean) => void = () => {};

    function Host(): ComponentChildren {
      const [shown, set] = useState(true);

      setShown = set;

      return shown ? (
        <RouterErrorBoundary
          fallback={(error) => {
            log.push(`fallback ${error.code}`);

            return null;
          }}
        >
          <Child />
        </RouterErrorBoundary>
      ) : null;
    }

    const errorSubscriptions = countSubscriptions(
      createDismissableError(instance),
    );

    render(
      <RouterProvider router={instance}>
        <Host />
      </RouterProvider>,
    );

    expect(errorSubscriptions()).toBeGreaterThan(0);

    await act(() => {
      setShown(false);
    });

    expect(errorSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("blocked").catch(() => {});
    });
    log.length = 0;
    await act(() => {
      setShown(true);
    });

    expect(log[0]).toBe("fallback CANNOT_ACTIVATE");
  });
});

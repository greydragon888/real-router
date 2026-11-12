import { createRouter } from "@real-router/core";
import {
  createDismissableError,
  createRouteNodeSource,
} from "@real-router/sources";
import { act, render, screen } from "@testing-library/react";
import { Activity, Component, useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  RouteView,
  RouterErrorBoundary,
  RouterProvider,
  useRoute,
} from "@real-router/react";

import type { Router } from "@real-router/core";
import type { ReactNode } from "react";

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

// `useSyncExternalStore` reads the source during render, before it subscribes.
// A component that mounts after a navigation it did not see must render the
// route the router is on, not the one its cached source held when the last
// subscriber left (#2909).
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

    function Page({ name }: { readonly name: string }): ReactNode {
      log.push(`render ${name}`);

      useEffect(() => {
        log.push(`effect ${name}`);
      }, [name]);

      return <p>{name}</p>;
    }

    let setShown: (shown: boolean) => void = () => {};

    function Host(): ReactNode {
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

    act(() => {
      setShown(false);
    });

    expect(nodeSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("cars");
    });
    log.length = 0;
    act(() => {
      setShown(true);
    });

    expect(log.filter((entry) => entry.endsWith("contacts"))).toStrictEqual([]);
    expect(log).toContain("effect cars");
  });

  // The page-level boundary resets when the route changes, so a click away
  // from a crashed page must leave the crash behind.
  it("a page boundary reset by the route leaves a page that threw", async () => {
    const instance = await started("/contacts");

    function Crashing(): ReactNode {
      throw new Error("contacts page crashed");
    }

    class PageBoundary extends Component<
      { readonly resetKey: string; readonly children: ReactNode },
      { failed: boolean; key: string }
    > {
      override state = { failed: false, key: this.props.resetKey };

      static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
      }

      static getDerivedStateFromProps(
        props: { readonly resetKey: string },
        state: { failed: boolean; key: string },
      ): { failed: boolean; key: string } | null {
        return props.resetKey === state.key
          ? null
          : { failed: false, key: props.resetKey };
      }

      override render(): ReactNode {
        const { children } = this.props;

        return this.state.failed ? (
          <p data-testid="fallback">fallback</p>
        ) : (
          children
        );
      }
    }

    function Pages(): ReactNode {
      const { route } = useRoute();

      return (
        <PageBoundary resetKey={route.path}>
          <RouteView nodeName="">
            <RouteView.Match segment="contacts">
              <Crashing />
            </RouteView.Match>
            <RouteView.Match segment="cars">
              <p data-testid="cars">cars</p>
            </RouteView.Match>
          </RouteView>
        </PageBoundary>
      );
    }

    const nodeSubscriptions = countSubscriptions(
      createRouteNodeSource(instance, ""),
    );

    render(
      <RouterProvider router={instance}>
        <Pages />
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(nodeSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("cars");
    });

    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("cars")).toBeInTheDocument();
    expect(nodeSubscriptions()).toBeGreaterThan(0);
  });

  it("a remounted RouterErrorBoundary renders an error raised while it was unmounted on its first render", async () => {
    const instance = await started("/contacts");
    const log: string[] = [];

    function Child(): ReactNode {
      log.push("child");

      return null;
    }

    let setShown: (shown: boolean) => void = () => {};

    function Host(): ReactNode {
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

    act(() => {
      setShown(false);
    });

    expect(errorSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("blocked").catch(() => {});
    });
    log.length = 0;
    act(() => {
      setShown(true);
    });

    expect(log[0]).toBe("fallback CANNOT_ACTIVATE");
  });

  it("a RouterProvider under <Activity> renders no stale route after hide → navigate → show", async () => {
    const instance = await started("/contacts");
    const log: string[] = [];

    function RouteName(): ReactNode {
      const { route } = useRoute();

      log.push(route.name);

      return <p>{route.name}</p>;
    }

    function Tree({
      mode,
    }: {
      readonly mode: "visible" | "hidden";
    }): ReactNode {
      return (
        <Activity mode={mode}>
          <RouterProvider router={instance}>
            <RouteName />
          </RouterProvider>
        </Activity>
      );
    }

    const routerSubscriptions = countSubscriptions(instance);
    const { rerender } = render(<Tree mode="visible" />);

    expect(routerSubscriptions()).toBeGreaterThan(0);

    rerender(<Tree mode="hidden" />);

    expect(routerSubscriptions()).toBe(0);

    await act(async () => {
      await instance.navigate("cars");
    });
    log.length = 0;
    rerender(<Tree mode="visible" />);

    expect(log.filter((name) => name === "contacts")).toStrictEqual([]);
    expect(log).toContain("cars");
  });
});

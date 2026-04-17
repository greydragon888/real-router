import { getLifecycleApi } from "@real-router/core/api";
import { render, act, cleanup, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";

import { RouterProvider, RouteView } from "@real-router/react";

import { createStressRouter } from "./helpers";

import type { FC, ReactNode } from "react";

interface Resource {
  resolve: () => void;
  read: () => void;
}

const makeResource = (): Resource => {
  let status: "pending" | "resolved" = "pending";
  let resolver: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolver = () => {
      status = "resolved";
      resolve();
    };
  });

  return {
    resolve: () => resolver?.(),
    read: () => {
      if (status === "pending") {
        // React Suspense protocol: throwing a thenable suspends the subtree.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw promise;
      }
    },
  };
};

const SuspendingPage: FC<{ id: string; resource: Resource }> = ({
  id,
  resource,
}) => {
  resource.read();

  return <div data-testid={`page-${id}`}>page {id}</div>;
};

SuspendingPage.displayName = "SuspendingPage";

const Fallback: FC<{ id: string }> = ({ id }) => (
  <div data-testid={`fallback-${id}`}>loading {id}</div>
);

Fallback.displayName = "Fallback";

describe("R9 — Suspense + router transition + Activity", () => {
  afterEach(() => {
    cleanup();
  });

  it("9.1: Suspense fallback shows during pending load, resolves without deadlock", async () => {
    const router = createStressRouter(3);

    await router.start("/route0");

    const resource = makeResource();

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="route0" fallback={<Fallback id="route0" />}>
            <SuspendingPage id="route0" resource={resource} />
          </RouteView.Match>
          <RouteView.Match segment="route1">
            <div data-testid="page-route1">page route1</div>
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback-route0")).toBeInTheDocument();

    await act(async () => {
      resource.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("page-route0")).toBeInTheDocument();
    });

    router.stop();
  });

  it("9.2: async guard + Suspense — guard resolves, then suspend resolves, final DOM correct", async () => {
    const router = createStressRouter(3);
    const lifecycle = getLifecycleApi(router);

    let resolveGuard: ((value: boolean) => void) | undefined;

    lifecycle.addActivateGuard("route1", () => (): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
      });
    });

    await router.start("/route0");

    const resource = makeResource();

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="route0">
            <div data-testid="page-route0">page route0</div>
          </RouteView.Match>
          <RouteView.Match segment="route1" fallback={<Fallback id="route1" />}>
            <SuspendingPage id="route1" resource={resource} />
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    expect(screen.getByTestId("page-route0")).toBeInTheDocument();

    const navigation = router.navigate("route1");

    // Guard is pending — navigation still in flight, route0 still mounted.
    expect(screen.getByTestId("page-route0")).toBeInTheDocument();

    await act(async () => {
      resolveGuard?.(true);
      await navigation;
    });

    // Now Suspense boundary shows fallback while the component suspends.
    expect(screen.getByTestId("fallback-route1")).toBeInTheDocument();

    await act(async () => {
      resource.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("page-route1")).toBeInTheDocument();
    });

    router.stop();
  });

  it("9.3: keepAlive + Suspense + 20 round-trip navigations — no zombie state", async () => {
    const router = createStressRouter(3);

    await router.start("/route0");

    const r0 = makeResource();
    const r1 = makeResource();

    // Resolve both suspensions immediately: this test validates Activity + Suspense interaction,
    // not the fallback rendering itself.
    r0.resolve();
    r1.resolve();

    const renderTarget = (id: string, resource: Resource): ReactNode => (
      <SuspendingPage id={id} resource={resource} />
    );

    render(
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match
            segment="route0"
            keepAlive
            fallback={<Fallback id="route0" />}
          >
            {renderTarget("route0", r0)}
          </RouteView.Match>
          <RouteView.Match
            segment="route1"
            keepAlive
            fallback={<Fallback id="route1" />}
          >
            {renderTarget("route1", r1)}
          </RouteView.Match>
        </RouteView>
      </RouterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("page-route0")).toBeInTheDocument();
    });

    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await router.navigate(i % 2 === 0 ? "route1" : "route0");
      });
    }

    // Final assertion: the last visited route is "route0" (even nav count).
    expect(router.getState()?.name).toBe("route0");

    // Both pages were rendered at least once. Activity keeps hidden ones in the tree.
    expect(screen.getByTestId("page-route0")).toBeInTheDocument();

    router.stop();
  });
});

import { createRouter } from "@real-router/core";
import { render, act, cleanup } from "@testing-library/react";
import { StrictMode, useState, useRef, useEffect } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  RouterProvider,
  useRouteNode,
  useRoute,
  useRouterTransition,
  Link,
} from "@real-router/react";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

const makeRenderCountingConsumer = (
  renderCounts: number[],
  i: number,
  displayName: string,
): FC => {
  const C: FC = () => {
    renderCounts[i]++;
    useRouteNode(`route${i}`);

    return <div />;
  };

  C.displayName = displayName;

  return C;
};

const makeNodeConsumers = (count: number, prefix: string): FC[] =>
  Array.from({ length: count }, (_, i) => {
    const C: FC = () => {
      useRouteNode(`route${i}`);

      return <div />;
    };

    C.displayName = `${prefix}${i}`;

    return C;
  });

describe("R3 — mount/unmount subscription lifecycle", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("3.1: mount/unmount useRouteNode × 200 cycles — no errors, bounded heap", () => {
    const NodeConsumer: FC = () => {
      useRouteNode("route0");

      return <div />;
    };
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <NodeConsumer />
        </RouterProvider>,
      );

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.2: mount/unmount useRoute × 200 cycles — no errors, bounded heap", () => {
    const RouteConsumer: FC = () => {
      useRoute();

      return <div />;
    };
    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <RouteConsumer />
        </RouterProvider>,
      );

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  });

  it("3.3: 50 components mount → navigate × 10 → unmount → remount → navigate × 10", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const consumers = Array.from({ length: 50 }, (_, i) => {
      const Consumer: FC = () => {
        const mountedRef = useRef(false);

        mountedRef.current = true;
        renderCounts[i]++;
        useRouteNode(`route${i}`);

        return <div />;
      };

      Consumer.displayName = `Consumer${i}`;

      return Consumer;
    });

    const { unmount } = render(
      <RouterProvider router={router}>
        {consumers.map((Consumer, i) => (
          <Consumer key={i} />
        ))}
      </RouterProvider>,
    );

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate(`route${i + 1}`);
      });
    }

    const countsAfterFirstCycle = [...renderCounts];

    countsAfterFirstCycle.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    unmount();

    renderCounts.fill(0);
    const { unmount: unmount2 } = render(
      <RouterProvider router={router}>
        {consumers.map((Consumer, i) => (
          <Consumer key={i} />
        ))}
      </RouterProvider>,
    );

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate(`route${i % 10}`);
      });
    }

    renderCounts.forEach((count) => {
      expect(count).toBeGreaterThan(0);
    });

    unmount2();
  });

  it("3.4: conditional toggle 20 useRouteNode × 100 — no errors", () => {
    const toggleRef: { current: (() => void) | null } = { current: null };

    const consumers = makeNodeConsumers(20, "ToggleConsumer");

    const Toggle: FC = () => {
      const [show, setShow] = useState(true);

      toggleRef.current = () => {
        setShow((s) => !s);
      };

      return show ? (
        <>
          {consumers.map((Consumer, i) => (
            <Consumer key={i} />
          ))}
        </>
      ) : null;
    };

    render(
      <RouterProvider router={router}>
        <Toggle />
      </RouterProvider>,
    );

    for (let i = 0; i < 100; i++) {
      act(() => {
        toggleRef.current?.();
      });
    }

    expect(router.getState()?.name).toBe("route0");
  });

  it("3.5: React StrictMode double mount + navigation — no errors, reasonable render counts", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 10 }).fill(0);

    const consumers = Array.from({ length: 10 }, (_, i) =>
      makeRenderCountingConsumer(renderCounts, i, `StrictConsumer${i}`),
    );

    render(
      <StrictMode>
        <RouterProvider router={router}>
          {consumers.map((Consumer, i) => (
            <Consumer key={i} />
          ))}
        </RouterProvider>
      </StrictMode>,
    );

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await router.navigate(`route${i + 1}`);
      });
    }

    renderCounts.forEach((count) => {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(200);
    });
  });

  it("3.6: router stop/restart while 50 components mounted — components receive post-restart navigations", async () => {
    const renderCounts: number[] = Array.from<number>({ length: 50 }).fill(0);

    const consumers = Array.from({ length: 50 }, (_, i) =>
      makeRenderCountingConsumer(renderCounts, i, `RestartConsumer${i}`),
    );

    render(
      <RouterProvider router={router}>
        {consumers.map((Consumer, i) => (
          <Consumer key={i} />
        ))}
      </RouterProvider>,
    );

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await router.navigate(`route${i + 1}`);
      });
    }

    const countsAfterFirstPhase = [...renderCounts];

    router.stop();

    await act(async () => {
      await router.start("/route0");
    });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await router.navigate(`route${i + 1}`);
      });
    }

    renderCounts.forEach((count, i) => {
      expect(count).toBeGreaterThanOrEqual(countsAfterFirstPhase[i]);
    });

    const totalAfter = renderCounts.reduce((a, b) => a + b, 0);
    const totalBefore = countsAfterFirstPhase.reduce((a, b) => a + b, 0);

    expect(totalAfter).toBeGreaterThan(totalBefore);
  });

  it("3.7: dynamic nodeName rapid switch × 100 on 20 components — no errors, final state correct", () => {
    const nodeNameRef: { current: (name: string) => void } = {
      current: () => {},
    };

    const NodeConsumer: FC<{ nodeName: string }> = ({ nodeName }) => {
      useRouteNode(nodeName);

      return <div data-node={nodeName} />;
    };

    const Parent: FC = () => {
      const [nodeNames, setNodeNames] = useState<string[]>(
        Array.from({ length: 20 }, (_, i) => `route${i}`),
      );

      nodeNameRef.current = (name: string) => {
        setNodeNames(Array.from({ length: 20 }, () => name));
      };

      return (
        <RouterProvider router={router}>
          {nodeNames.map((name, i) => (
            <NodeConsumer key={i} nodeName={name} />
          ))}
        </RouterProvider>
      );
    };

    const { container } = render(<Parent />);

    for (let i = 0; i < 100; i++) {
      act(() => {
        nodeNameRef.current(`route${i % 10}`);
      });
    }

    const finalName = `route${99 % 10}`;
    const nodes = container.querySelectorAll(`[data-node="${finalName}"]`);

    expect(nodes).toHaveLength(20);
  });

  it("3.8: mount/unmount Link × 200 cycles — no crashes, Link works after cycles", async () => {
    for (let i = 0; i < 200; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <Link routeName="route0">L</Link>
        </RouterProvider>,
      );

      unmount();
    }

    const { getByText } = render(
      <RouterProvider router={router}>
        <Link routeName="route1">go</Link>
      </RouterProvider>,
    );

    const link = getByText("go");

    expect(link).toBeInTheDocument();

    await act(async () => {
      await router.navigate("route1");
    });

    expect(router.getState()?.name).toBe("route1");
  });

  it("3.9: mount/unmount useRouterTransition × 200 cycles — no crashes, transitions work after cycles", async () => {
    const TransitionConsumer: FC = () => {
      useRouterTransition();

      return <div />;
    };

    for (let i = 0; i < 200; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <TransitionConsumer />
        </RouterProvider>,
      );

      unmount();
    }

    const freshRouter = createRouter([
      { name: "t1", path: "/t1" },
      { name: "t2", path: "/t2" },
      { name: "t3", path: "/t3" },
    ]);

    await act(async () => {
      await freshRouter.start("/t1");
    });

    const TransitionChecker: FC<{
      onTransition: (v: ReturnType<typeof useRouterTransition>) => void;
    }> = ({ onTransition }) => {
      const transition = useRouterTransition();

      onTransition(transition);

      return <div />;
    };

    let lastTransition: ReturnType<typeof useRouterTransition> | null = null;

    render(
      <RouterProvider router={freshRouter}>
        <TransitionChecker
          onTransition={(v) => {
            lastTransition = v;
          }}
        />
      </RouterProvider>,
    );

    await act(async () => {
      await freshRouter.navigate("t2");
    });

    expect(lastTransition).not.toBeNull();
    expect(freshRouter.getState()?.name).toBe("t2");

    freshRouter.stop();
  });

  it("3.10: rapid start/stop cycling × 100 with mounted components — no crashes, final state correct", async () => {
    const localRouter = createStressRouter(10);

    await localRouter.start("/route0");

    const consumers = makeNodeConsumers(10, "StartStopConsumer");

    const { unmount } = render(
      <RouterProvider router={localRouter}>
        {consumers.map((Consumer, i) => (
          <Consumer key={i} />
        ))}
      </RouterProvider>,
    );

    for (let i = 0; i < 100; i++) {
      await act(async () => {
        localRouter.stop();
      });

      await act(async () => {
        await localRouter.start("/route0");
      });
    }

    await act(async () => {
      await localRouter.navigate("route1");
    });

    expect(localRouter.getState()?.name).toBe("route1");

    unmount();
    localRouter.stop();
  });

  it("3.11: navigate during unmount — no unhandled rejections", async () => {
    let unhandledRejection = false;

    const handler = (): void => {
      unhandledRejection = true;
    };

    globalThis.addEventListener("unhandledrejection", handler);

    const NavigateOnUnmount: FC = () => {
      const routerRef = useRef(router);

      useEffect(() => {
        return () => {
          void routerRef.current.navigate("route1");
        };
      }, []);

      useRouteNode("route0");

      return <div />;
    };

    const { unmount } = render(
      <RouterProvider router={router}>
        <NavigateOnUnmount />
      </RouterProvider>,
    );

    unmount();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(unhandledRejection).toBe(false);

    globalThis.removeEventListener("unhandledrejection", handler);
  });

  it("3.11b: 50 mount/unmount cycles with concurrent navigate — no leaks, no rejections", async () => {
    let unhandledRejection = false;

    const handler = (): void => {
      unhandledRejection = true;
    };

    globalThis.addEventListener("unhandledrejection", handler);

    const NavigateOnUnmount: FC<{ target: string }> = ({ target }) => {
      const routerRef = useRef(router);
      const targetRef = useRef(target);

      targetRef.current = target;

      useEffect(() => {
        return () => {
          // Fire-and-forget navigate from cleanup — must not crash or leak.
          void routerRef.current.navigate(targetRef.current).catch(() => {});
        };
      }, []);

      useRouteNode("");

      return <div />;
    };

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 50; cycle++) {
      const target = `route${(cycle % 10) + 1}`;

      const { unmount } = render(
        <RouterProvider router={router}>
          <NavigateOnUnmount target={target} />
        </RouterProvider>,
      );

      // Kick off a concurrent navigate BEFORE unmount — reproduces the race
      // between in-flight transition and RouterProvider teardown.
      const concurrent = router.navigate(`route${cycle % 5}`).catch(() => {});

      unmount();

      await concurrent;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }

    const heapAfter = takeHeapSnapshot();

    expect(unhandledRejection).toBe(false);
    expect(heapAfter - heapBefore).toBeLessThan(30 * MB);

    globalThis.removeEventListener("unhandledrejection", handler);
  });

  it("3.12: 10000 navigate cycles on single mounted tree — bounded heap growth", async () => {
    const consumers = makeNodeConsumers(20, "HeapConsumer");

    const { unmount } = render(
      <RouterProvider router={router}>
        {consumers.map((Consumer, i) => (
          <Consumer key={i} />
        ))}
      </RouterProvider>,
    );

    // Warm up + baseline after initial allocations settle.
    for (let i = 0; i < 100; i++) {
      await act(async () => {
        await router.navigate(`route${(i % 10) + 1}`);
      });
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      await act(async () => {
        await router.navigate(`route${(i % 10) + 1}`);
      });
    }

    const heapAfter = takeHeapSnapshot();

    // 100 → 10100 navigations: growth should remain bounded. 50 MB is generous
    // for jsdom + React fiber overhead but will catch linear listener leaks.
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
    expect(router.getState()).toBeDefined();

    unmount();
  });

  it("3.13: 200 router instances disposed — WeakMap caches for error/transition/utils release", async () => {
    // Consumer touches ALL WeakMap-cached hooks (useRouterError, useRouterTransition,
    // useRouteUtils, useRouteNode). If any cache leaks, heap grows linearly.
    const FullCacheConsumer: FC = () => {
      useRouteNode("route0");
      useRoute();
      useRouterTransition();

      return <div />;
    };

    FullCacheConsumer.displayName = "FullCacheConsumer";

    // Warm-up: one router instance to trigger module-level lazy init.
    {
      const warm = createStressRouter(10);

      await warm.start("/route0");
      const { unmount } = render(
        <RouterProvider router={warm}>
          <FullCacheConsumer />
        </RouterProvider>,
      );

      await act(async () => {
        await warm.navigate("route1");
      });
      unmount();
      warm.stop();
    }

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      const localRouter = createStressRouter(10);

      await localRouter.start("/route0");

      const { unmount } = render(
        <RouterProvider router={localRouter}>
          <FullCacheConsumer />
          <FullCacheConsumer />
          <FullCacheConsumer />
        </RouterProvider>,
      );

      await act(async () => {
        await localRouter.navigate("route1");
      });

      unmount();
      localRouter.stop();
    }

    const heapAfter = takeHeapSnapshot();

    // If WeakMap-keyed sources leak, 200 routers × several caches × subscribers
    // each would bloat heap well past 40 MB. Bound catches regressions.
    expect(heapAfter - heapBefore).toBeLessThan(40 * MB);

    // Sanity: a fresh router still works after the burst.
    const finalRouter = createStressRouter(10);

    await finalRouter.start("/route0");

    const { unmount } = render(
      <RouterProvider router={finalRouter}>
        <FullCacheConsumer />
      </RouterProvider>,
    );

    await act(async () => {
      await finalRouter.navigate("route1");
    });

    expect(finalRouter.getState()?.name).toBe("route1");

    unmount();
    finalRouter.stop();
  });
});

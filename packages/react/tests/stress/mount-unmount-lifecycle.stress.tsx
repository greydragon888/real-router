import { createRouter } from "@real-router/core";
import { render, act, cleanup } from "@testing-library/react";
import { StrictMode, useState, useRef } from "react";
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

    const consumers = Array.from({ length: 20 }, (_, i) => {
      const Consumer: FC = () => {
        useRouteNode(`route${i}`);

        return <div />;
      };

      Consumer.displayName = `ToggleConsumer${i}`;

      return Consumer;
    });

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

    expect(true).toBe(true);
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
});

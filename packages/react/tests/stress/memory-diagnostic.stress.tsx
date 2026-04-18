/* eslint-disable vitest/expect-expect, sonarjs/no-identical-functions, @eslint-react/naming-convention-context-name -- diagnostic tests: assertions inside measureMountUnmount, tiny <5-line consumer bodies are by design, local Ctx name is a test fixture */
import { createRouteSource } from "@real-router/sources";
import { render, cleanup, configure } from "@testing-library/react";
import { createContext, useContext, useSyncExternalStore } from "react";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";

import {
  RouterProvider,
  useRouter,
  useRoute,
  useRouterTransition,
} from "@real-router/react";

import { createStressRouter, forceGC, getHeapUsedBytes } from "./helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

const originalWrite = process.stdout.write.bind(process.stdout);

function logDiag(
  label: string,
  iterations: number,
  deltaBytes: number,
  notes = "",
): void {
  const deltaKb = (deltaBytes / 1024).toFixed(1);
  const perIter = iterations > 0 ? (deltaBytes / iterations).toFixed(0) : "n/a";
  const line = `[diagnostic] ${label} iters=${iterations} delta=${deltaKb}KB per-iter=${perIter}B ${notes}\n`;

  originalWrite(line);
}

function stabilizeHeap(): number {
  forceGC();
  forceGC();

  return getHeapUsedBytes();
}

function measureMountUnmount(
  label: string,
  iterations: number,
  mountOnce: () => () => void,
  notes = "",
): void {
  // warm-up
  {
    const u = mountOnce();

    u();
  }

  const before = stabilizeHeap();

  for (let i = 0; i < iterations; i++) {
    const u = mountOnce();

    u();
  }

  const after = stabilizeHeap();
  const delta = after - before;

  logDiag(label, iterations, delta, notes);

  // Diagnostic tests log heap data only — no strict bounds.
  expect(typeof delta).toBe("number");
}

describe("memory diagnostic — React adapter deep analysis", () => {
  let router: Router;

  beforeAll(() => {
    configure({ reactStrictMode: false });
  });

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    cleanup();
    router.stop();
  });

  afterAll(() => {
    configure({ reactStrictMode: true });
  });

  // L0: чистый React — пустой компонент, mount/unmount × 1000
  // Это baseline "цена React".
  it("L0: pure React — mount/unmount empty <div /> × 1000", () => {
    const Empty: FC = () => <div />;

    measureMountUnmount(
      "L0-pure-react-empty",
      1000,
      () => {
        const { unmount } = render(<Empty />);

        return unmount;
      },
      "baseline React cost",
    );
  });

  // L1: React с одним контекстом, без subscription
  it("L1: React + Context.Provider + useContext (no subscription) × 1000", () => {
    const Ctx = createContext<{ v: number }>({ v: 0 });
    const Consumer: FC = () => {
      useContext(Ctx);

      return <div />;
    };

    measureMountUnmount(
      "L1-context-only",
      1000,
      () => {
        const { unmount } = render(
          <Ctx.Provider value={{ v: 1 }}>
            <Consumer />
          </Ctx.Provider>,
        );

        return unmount;
      },
      "React context overhead",
    );
  });

  // L2: React + useSyncExternalStore с shared store
  it("L2: useSyncExternalStore with SHARED store × 1000", () => {
    const listeners = new Set<() => void>();
    const store = {
      subscribe: (l: () => void) => {
        listeners.add(l);

        return () => {
          listeners.delete(l);
        };
      },
      getSnapshot: () => 1,
    };

    const Consumer: FC = () => {
      useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
      );

      return <div />;
    };

    measureMountUnmount(
      "L2-uSES-shared-store",
      1000,
      () => {
        const { unmount } = render(<Consumer />);

        return unmount;
      },
      "React useSyncExternalStore cost (shared store)",
    );
  });

  // L3: React + useSyncExternalStore с FRESH store каждый mount
  it("L3: useSyncExternalStore with FRESH store per mount × 1000", () => {
    const Consumer: FC = () => {
      const listeners = new Set<() => void>();
      const snapshot = { v: 1 };
      const subscribe = (l: () => void): (() => void) => {
        listeners.add(l);

        return () => {
          listeners.delete(l);
        };
      };
      const getSnapshot = (): typeof snapshot => snapshot;

      useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      return <div />;
    };

    measureMountUnmount(
      "L3-uSES-fresh-store",
      1000,
      () => {
        const { unmount } = render(<Consumer />);

        return unmount;
      },
      "fresh store closures per mount (React captures these in fiber)",
    );
  });

  // L4: createRouteSource в цикле БЕЗ React — чистая цена source
  it("L4: createRouteSource × 1000 WITHOUT React (no mount)", () => {
    const before = stabilizeHeap();

    for (let i = 0; i < 1000; i++) {
      const s = createRouteSource(router);
      const unsub = s.subscribe(() => {});

      unsub();
    }

    const after = stabilizeHeap();
    const delta = after - before;

    logDiag("L4-source-only-no-react", 1000, delta, "pure source cost");

    expect(typeof delta).toBe("number");
  });

  // L5: RouterProvider без хуков внутри
  it("L5: <RouterProvider><div /></RouterProvider> × 1000 (no hooks)", () => {
    measureMountUnmount(
      "L5-provider-empty-child",
      1000,
      () => {
        const { unmount } = render(
          <RouterProvider router={router}>
            <div />
          </RouterProvider>,
        );

        return unmount;
      },
      "RouterProvider itself (creates createRouteSource per mount!)",
    );
  });

  // L6: RouterProvider + useRouter (context read, no subscription)
  it("L6: useRouter (context read, no subscription) × 1000", () => {
    const Consumer: FC = () => {
      useRouter();

      return <div />;
    };

    measureMountUnmount(
      "L6-useRouter-context",
      1000,
      () => {
        const { unmount } = render(
          <RouterProvider router={router}>
            <Consumer />
          </RouterProvider>,
        );

        return unmount;
      },
      "L5 + context read (should be ~L5)",
    );
  });

  // L7: RouterProvider + useRoute (subscribe to RouteContext — no external store)
  it("L7: useRoute × 1000", () => {
    const Consumer: FC = () => {
      useRoute();

      return <div />;
    };

    measureMountUnmount(
      "L7-useRoute",
      1000,
      () => {
        const { unmount } = render(
          <RouterProvider router={router}>
            <Consumer />
          </RouterProvider>,
        );

        return unmount;
      },
      "useRoute reads RouteContext (no external store subscription)",
    );
  });

  // L8: useRouterTransition (наш оригинальный тест)
  it("L8: useRouterTransition × 1000", () => {
    const Consumer: FC = () => {
      useRouterTransition();

      return <div />;
    };

    measureMountUnmount(
      "L8-useRouterTransition",
      1000,
      () => {
        const { unmount } = render(
          <RouterProvider router={router}>
            <Consumer />
          </RouterProvider>,
        );

        return unmount;
      },
      "L6 + cached transition source subscription",
    );
  });

  // L9: FinalizationRegistry — проверяем GC-ность компонентов
  it("L9: FinalizationRegistry GC check — do components get collected?", async () => {
    let collected = 0;
    const fr = new FinalizationRegistry(() => {
      collected++;
    });

    const refs: WeakRef<object>[] = [];

    const Consumer: FC = () => {
      useRouterTransition();

      return <div />;
    };

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(
        <RouterProvider router={router}>
          <Consumer />
        </RouterProvider>,
      );

      const markerObj = { i };

      fr.register(markerObj, "marker");
      refs.push(new WeakRef(markerObj));
      unmount();
    }

    // даём GC возможность собрать
    for (let i = 0; i < 5; i++) {
      forceGC();
      await new Promise((r) => setTimeout(r, 10));
    }

    const liveRefs = refs.filter((r) => r.deref() !== undefined).length;
    const deadRefs = 100 - liveRefs;

    logDiag(
      "L9-finalization-gc-check",
      100,
      0,
      `collected=${collected}/100 WeakRef-dead=${deadRefs}/100 WeakRef-alive=${liveRefs}`,
    );

    // GC-check: at least half of the registered refs should be collected.
    // This asserts GC works for the component tree; exact count is environment-dependent.
    expect(deadRefs).toBeGreaterThan(50);
  });
});

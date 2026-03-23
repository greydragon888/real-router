import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { formatBytes, MB, takeHeapSnapshot } from "./helpers";

import type { Route } from "@real-router/core";

describe("S16: forwardTo chain resolution", () => {
  it("S16.2: Dynamic forwardTo callback × 200 navigations — callback invoked correctly", async () => {
    let callCount = 0;

    const routes: Route[] = [
      {
        name: "start",
        path: "/start",
        forwardTo: () => {
          callCount++;

          return "mid";
        },
      },
      {
        name: "mid",
        path: "/mid",
        forwardTo: () => {
          callCount++;

          return "end";
        },
      },
      { name: "end", path: "/end" },
      { name: "home", path: "/home" },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });

    await router.start("/home");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        const state = await router.navigate("start");

        expect(state.name).toBe("end");
      } else {
        await router.navigate("home");
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    router.stop();
    router.dispose();

    expect(callCount).toBeGreaterThan(0);
    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  }, 30_000);

  it("S16.3: Chain depth=99 resolves OK, depth=100+ throws (MAX_DEPTH=100 in RoutesNamespace)", async () => {
    {
      const routes: Route[] = [];

      for (let i = 0; i < 99; i++) {
        routes.push({
          name: `ok${i}`,
          path: `/ok${i}`,
          forwardTo: () => `ok${i + 1}`,
        });
      }

      routes.push(
        { name: "ok99", path: "/ok99" },
        { name: "okHome", path: "/okHome" },
      );

      const router = createRouter(routes, { defaultRoute: "okHome" });

      await router.start("/okHome");

      const state = await router.navigate("ok0");

      expect(state.name).toBe("ok99");

      router.stop();
      router.dispose();
    }

    {
      const routes: Route[] = [];

      for (let i = 0; i < 101; i++) {
        routes.push({
          name: `err${i}`,
          path: `/err${i}`,
          forwardTo: () => `err${i + 1}`,
        });
      }

      routes.push(
        { name: "err101", path: "/err101" },
        { name: "errHome", path: "/errHome" },
      );

      const router = createRouter(routes, { defaultRoute: "errHome" });

      await router.start("/errHome");

      let threw = false;

      try {
        await router.navigate("err0");
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);

      router.stop();
      router.dispose();
    }
  }, 30_000);

  it("S16.4: Mixed static→dynamic chains, 200 navigations — full chain resolves correctly", async () => {
    const routes: Route[] = [
      { name: "start", path: "/start", forwardTo: "mid" },
      { name: "mid", path: "/mid", forwardTo: () => "end" },
      { name: "end", path: "/end" },
      { name: "home", path: "/home" },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });

    await router.start("/home");

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        const state = await router.navigate("start");

        expect(state.name).toBe("end");
      } else {
        await router.navigate("home");
      }
    }

    const heapAfter = takeHeapSnapshot();
    const delta = heapAfter - heapBefore;

    router.stop();
    router.dispose();

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(10 * MB);
  }, 30_000);
});

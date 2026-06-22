import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

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

    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        const state = await router.navigate("start");

        expect(state.name).toBe("end");
      } else {
        await router.navigate("home");
      }
    }

    router.stop();
    router.dispose();

    // 100 navigations to "start" (even i), each resolving the 2-hop dynamic
    // chain start → mid → end → 2 callback invocations apiece = exactly 200.
    // Exact count discriminates a regression where forwardTo stops re-firing
    // (dynamic callbacks must run on every navigation, not be cached) or fires
    // the wrong number of hops — the old `> 0` passed even if 199 of 200
    // navigations skipped the chain.
    expect(callCount).toBe(200);
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

      let error: unknown;

      try {
        await router.navigate("err0");
      } catch (error_) {
        error = error_;
      }

      // Assert it threw the SPECIFIC depth-cap error, not just "some error".
      // The old `threw === true` passed for any throw (e.g. a route-not-found
      // if the chain were mis-wired), so it didn't prove the MAX_DEPTH guard
      // actually fired.
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("maximum depth");

      router.stop();
      router.dispose();
    }
  }, 30_000);

  it("S16.4: Mixed static→dynamic chains, 200 navigations — full chain resolves correctly", async () => {
    let dynamicCalls = 0;

    const routes: Route[] = [
      { name: "start", path: "/start", forwardTo: "mid" },
      {
        name: "mid",
        path: "/mid",
        forwardTo: () => {
          dynamicCalls++;

          return "end";
        },
      },
      { name: "end", path: "/end" },
      { name: "home", path: "/home" },
    ];

    const router = createRouter(routes, { defaultRoute: "home" });

    await router.start("/home");

    for (let i = 0; i < 200; i++) {
      if (i % 2 === 0) {
        const state = await router.navigate("start");

        expect(state.name).toBe("end");
      } else {
        await router.navigate("home");
      }
    }

    router.stop();
    router.dispose();

    // 100 navigations to "start" resolve the mixed static (start→mid) then
    // dynamic (mid→end) chain → the dynamic leg's callback fires exactly once
    // per navigation = 100. Discriminates a regression in static→dynamic
    // chaining (would drop to 0 / land on "mid") on top of the in-loop
    // state.name check. (Replaces an un-anchored, GC-masked heap assert —
    // navigation-allocation churn is covered by navigation-memory.)
    expect(dynamicCalls).toBe(100);
  }, 30_000);
});

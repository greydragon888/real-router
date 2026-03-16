import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createFixtureRouter, NUM_RUNS } from "./helpers";

const arbParamlessRoute = fc.constantFrom(
  "home" as const,
  "users.list" as const,
  "admin.dashboard" as const,
  "admin.settings" as const,
);

describe("navigateToDefault Properties", () => {
  test.prop([arbParamlessRoute], { numRuns: NUM_RUNS.fast })(
    "resolves to default route when defaultRoute is set",
    async (defaultRoute) => {
      const router = createFixtureRouter({ defaultRoute });
      const startPath = defaultRoute === "home" ? "/admin" : "/";

      await router.start(startPath);
      const state = await router.navigateToDefault();

      expect(state.name).toBe(defaultRoute);

      router.stop();
    },
  );

  it("rejects when no defaultRoute is configured", async () => {
    const router = createFixtureRouter();

    await router.start("/");

    await expect(router.navigateToDefault()).rejects.toThrow();

    router.stop();
  });

  test.prop([arbParamlessRoute], { numRuns: NUM_RUNS.fast })(
    "equivalent to navigate(defaultRoute) by resulting state",
    async (defaultRoute) => {
      const startPath = defaultRoute === "home" ? "/admin" : "/";
      const router1 = createFixtureRouter({ defaultRoute });
      const router2 = createFixtureRouter({ defaultRoute });

      await router1.start(startPath);
      await router2.start(startPath);

      const state1 = await router1.navigateToDefault();
      const state2 = await router2.navigate(defaultRoute);

      expect(state1.name).toBe(state2.name);
      expect(state1.path).toBe(state2.path);

      router1.stop();
      router2.stop();
    },
  );

  test.prop([arbParamlessRoute], { numRuns: NUM_RUNS.fast })(
    "defaultRoute as callback: resolves correctly",
    async (defaultRoute) => {
      const router = createFixtureRouter({
        defaultRoute: () => defaultRoute,
      });
      const startPath = defaultRoute === "home" ? "/admin" : "/";

      await router.start(startPath);
      const state = await router.navigateToDefault();

      expect(state.name).toBe(defaultRoute);

      router.stop();
    },
  );
});

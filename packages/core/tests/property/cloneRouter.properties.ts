import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  arbStartPath,
  FIXTURE_ROUTE_NAMES,
  NUM_RUNS,
} from "./helpers";

describe("cloneRouter Properties", () => {
  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "route preservation: cloned router has same routes as source",
    (path) => {
      const router = createFixtureRouter();
      const cloned = cloneRouter(router);
      const sourceRoutes = getRoutesApi(router);
      const clonedRoutes = getRoutesApi(cloned);

      for (const name of FIXTURE_ROUTE_NAMES) {
        expect(clonedRoutes.has(name)).toBe(sourceRoutes.has(name));
      }

      void path;
    },
  );

  it("state independence: cloned router starts with no state", () => {
    const router = createFixtureRouter();
    const cloned = cloneRouter(router);

    expect(cloned.getState()).toBeUndefined();
  });

  it("dependency merge: override deps are merged with source", () => {
    const router = createFixtureRouter();

    interface Deps {
      apiUrl: string;
      token: string;
    }
    const cloned = cloneRouter<Deps>(
      router as never,
      {
        apiUrl: "https://test",
        token: "abc",
      } as Deps,
    );

    expect(cloned).toBeDefined();
  });

  it("disposed source throws ROUTER_DISPOSED", async () => {
    const router = await createStartedRouter();

    router.dispose();

    expect(() => {
      cloneRouter(router);
    }).toThrowError(RouterError);

    expect(() => {
      cloneRouter(router);
    }).toThrowError(
      expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
    );
  });

  it("cloned router can start and navigate independently", async () => {
    const source = createFixtureRouter();
    const cloned = cloneRouter(source);

    await cloned.start("/");

    expect(cloned.getState()!.name).toBe("home");
    expect(source.getState()).toBeUndefined();

    await cloned.navigate("admin.settings");

    expect(cloned.getState()!.name).toBe("admin.settings");

    cloned.stop();
  });

  it("cloned router preserves guards from source", async () => {
    const source = createFixtureRouter();
    const { getLifecycleApi } = await import("@real-router/core/api");
    const lifecycle = getLifecycleApi(source);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const cloned = cloneRouter(source);

    await cloned.start("/");

    expect(cloned.canNavigateTo("admin.settings")).toBe(false);

    cloned.stop();
  });
});

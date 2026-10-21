/**
 * The staleness flag belongs to the navigation that carries the fresh node: it
 * is cleared when that navigation commits, not when its loader resolves on
 * leave. An activation guard runs after the leave, so a navigation it refuses
 * loaded a node the router never shows, and the next navigation loads again.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { invalidate, rscServerPluginFactory } from "../../src";

const routes = [{ name: "users", path: "/users/:id" }];

async function start(): Promise<{
  router: ReturnType<typeof createRouter>;
  calls: () => number;
}> {
  let calls = 0;
  const router = createRouter(routes);

  router.usePlugin(
    rscServerPluginFactory({
      users: () => () => {
        calls += 1;

        return `node#${calls}`;
      },
    }),
  );
  await router.start("/users/1");

  return { router, calls: () => calls };
}

describe("rsc: the staleness flag is cleared by the commit that carries the fresh node", () => {
  it("a navigation refused after its leave leaves the refresh to the next one", async () => {
    const { router, calls } = await start();

    getLifecycleApi(router).addActivateGuard(
      "users",
      () => (toState) => toState.params.id !== "2",
    );
    invalidate(router, "rsc");

    await expect(router.navigate("users", { id: "2" })).rejects.toMatchObject({
      code: "CANNOT_ACTIVATE",
    });

    const afterRefusal = calls();

    await router.navigate("users", { id: "3" });

    expect(calls()).toBe(afterRefusal + 1);
    expect(router.getState()?.context.rsc).toBe(`node#${calls()}`);

    router.stop();
  });

  it("CONTROL — a navigation that lands consumes the flag", async () => {
    const { router, calls } = await start();

    invalidate(router, "rsc");
    await router.navigate("users", { id: "2" });

    const afterLanding = calls();

    await router.navigate("users", { id: "3" });

    expect(calls()).toBe(afterLanding);

    router.stop();
  });
});

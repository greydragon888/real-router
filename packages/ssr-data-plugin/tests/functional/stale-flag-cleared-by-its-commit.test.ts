/**
 * The staleness flag belongs to the navigation that carries the fresh data: it
 * is cleared when that navigation commits, not when its loader resolves on
 * leave. A navigation can still be refused or cancelled after its leave —
 * an activation guard runs later — and the data it loaded never reaches the
 * router, so the next navigation must load again.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { invalidate, ssrDataPluginFactory } from "../../src";

import type { Router } from "@real-router/core";

const routes = [{ name: "users", path: "/users/:id" }];

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface Harness {
  router: Router;
  calls: () => number;
  setVersion: (version: string) => void;
}

async function start(): Promise<Harness> {
  let calls = 0;
  let version = "v1";
  const router = createRouter(routes);

  router.usePlugin(
    ssrDataPluginFactory({
      users: () => async () => {
        calls += 1;

        return `${version}#${calls}`;
      },
    }),
  );
  await router.start("/users/1");

  return {
    router,
    calls: () => calls,
    setVersion: (next) => {
      version = next;
    },
  };
}

describe("the staleness flag is cleared by the commit that carries the fresh data", () => {
  it("a navigation refused after its leave leaves the refresh to the next one", async () => {
    const { router, calls, setVersion } = await start();

    getLifecycleApi(router).addActivateGuard(
      "users",
      () => (toState) => toState.params.id !== "2",
    );
    setVersion("v2");
    invalidate(router, "data");

    await expect(router.navigate("users", { id: "2" })).rejects.toMatchObject({
      code: "CANNOT_ACTIVATE",
    });

    const afterRefusal = calls();

    await router.navigate("users", { id: "3" });

    expect(calls()).toBe(afterRefusal + 1);
    expect(router.getState()?.context.data).toBe(`v2#${calls()}`);

    router.stop();
  });

  it("a navigation cancelled after its leave leaves the refresh to the one that cancelled it", async () => {
    const { router, calls, setVersion } = await start();

    getLifecycleApi(router).addActivateGuard("users", () => (toState) => {
      if (toState.params.id !== "2") {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 30);
      });
    });
    setVersion("v2");
    invalidate(router, "data");

    const held = router.navigate("users", { id: "2" });

    await wait(5); // its loader resolved; its activation guard still holds it
    const afterLeave = calls();

    await router.navigate("users", { id: "3" });

    await expect(held).rejects.toMatchObject({ code: "CANCELLED" });
    expect(calls()).toBe(afterLeave + 1);
    expect(router.getState()?.context.data).toBe(`v2#${calls()}`);

    router.stop();
  });

  it("an invalidate() between the refresh and its commit stays for the next navigation", async () => {
    const { router, calls, setVersion } = await start();
    let release = (): void => {};

    getLifecycleApi(router).addActivateGuard("users", () => (toState) => {
      if (toState.params.id !== "2") {
        return true;
      }

      return new Promise<boolean>((resolve) => {
        release = () => {
          resolve(true);
        };
      });
    });
    setVersion("v2");
    invalidate(router, "data");

    const held = router.navigate("users", { id: "2" });

    await wait(5); // its loader resolved with v2; its activation guard holds it
    setVersion("v3");
    invalidate(router, "data"); // the data changed again after that load
    release();
    await held;

    const afterCommit = calls();

    expect(router.getState()?.context.data).toBe(`v2#${afterCommit}`);

    await router.navigate("users", { id: "3" });

    expect(calls()).toBe(afterCommit + 1);
    expect(router.getState()?.context.data).toBe(`v3#${calls()}`);

    router.stop();
  });

  it("CONTROL — a navigation that lands consumes the flag", async () => {
    const { router, calls, setVersion } = await start();

    setVersion("v2");
    invalidate(router, "data");

    await router.navigate("users", { id: "2" });

    const afterLanding = calls();

    expect(router.getState()?.context.data).toBe(`v2#${afterLanding}`);

    await router.navigate("users", { id: "3" });

    expect(calls()).toBe(afterLanding);

    router.stop();
  });
});

import { fc, test } from "@fast-check/vitest";
import { describe, expect, it, vi } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  createFixtureRouter,
  createStartedRouter,
  arbNavigableRoute,
  NUM_RUNS,
} from "./helpers";

import type { PluginFactory, State } from "@real-router/core";

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

function createSpyPlugin(): {
  factory: PluginFactory;
  calls: string[];
  teardownCalled: () => boolean;
} {
  const calls: string[] = [];
  let tornDown = false;

  const factory: PluginFactory = () => ({
    onStart() {
      calls.push("onStart");
    },
    onStop() {
      calls.push("onStop");
    },
    onTransitionStart() {
      calls.push("onTransitionStart");
    },
    onTransitionSuccess() {
      calls.push("onTransitionSuccess");
    },
    onTransitionError() {
      calls.push("onTransitionError");
    },
    onTransitionCancel() {
      calls.push("onTransitionCancel");
    },
    teardown() {
      tornDown = true;
      calls.push("teardown");
    },
  });

  return { factory, calls, teardownCalled: () => tornDown };
}

describe("usePlugin Properties", () => {
  it("unsubscribe calls teardown on each plugin", async () => {
    const router = await createStartedRouter();
    const spy1 = createSpyPlugin();
    const spy2 = createSpyPlugin();

    const unsubscribe = router.usePlugin(spy1.factory, spy2.factory);

    unsubscribe();

    expect(spy1.teardownCalled()).toBe(true);
    expect(spy2.teardownCalled()).toBe(true);

    router.stop();
  });

  it("idempotent unsubscribe: second call does not throw", async () => {
    const router = await createStartedRouter();
    const spy = createSpyPlugin();
    const unsubscribe = router.usePlugin(spy.factory);

    unsubscribe();

    expect(() => {
      unsubscribe();
    }).not.toThrowError();

    router.stop();
  });

  test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.fast })(
    "all plugins receive same toState/fromState on navigation",
    async (targetRoute) => {
      fc.pre(targetRoute !== "home");

      const router = createFixtureRouter();
      const received1: { to: string | undefined; from: string | undefined } = {
        to: undefined,
        from: undefined,
      };
      const received2: { to: string | undefined; from: string | undefined } = {
        to: undefined,
        from: undefined,
      };

      const plugin1: PluginFactory = () => ({
        onTransitionSuccess(toState: State, fromState?: State) {
          received1.to = toState.name;
          received1.from = fromState?.name;
        },
      });

      const plugin2: PluginFactory = () => ({
        onTransitionSuccess(toState: State, fromState?: State) {
          received2.to = toState.name;
          received2.from = fromState?.name;
        },
      });

      router.usePlugin(plugin1, plugin2);

      await router.start("/");
      await router.navigate(targetRoute, getParamsForRoute(targetRoute));

      expect(received1.to).toBe(received2.to);
      expect(received1.from).toBe(received2.from);

      router.stop();
    },
  );

  it("usePlugin after start: onStart is NOT called", async () => {
    const router = await createStartedRouter();
    const spy = createSpyPlugin();

    router.usePlugin(spy.factory);

    expect(spy.calls).not.toContain("onStart");

    router.stop();
  });

  it("usePlugin on disposed router throws ROUTER_DISPOSED", async () => {
    const router = await createStartedRouter();

    router.dispose();

    expect(() => {
      router.usePlugin(createSpyPlugin().factory);
    }).toThrowError(RouterError);

    expect(() => {
      router.usePlugin(createSpyPlugin().factory);
    }).toThrowError(
      expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
    );
  });

  it("plugins receive events in registration order", async () => {
    const router = createFixtureRouter();
    const order: number[] = [];
    let recording = false;

    const makePlugin =
      (id: number): PluginFactory =>
      () => ({
        onTransitionSuccess() {
          if (recording) {
            order.push(id);
          }
        },
      });

    router.usePlugin(makePlugin(1), makePlugin(2), makePlugin(3));

    await router.start("/");

    recording = true;

    await router.navigate("admin.settings");

    expect(order).toStrictEqual([1, 2, 3]);

    router.stop();
  });

  it("onTransitionSuccess receives opts with navigation options", async () => {
    const router = createFixtureRouter();
    const receivedOpts = vi.fn();

    const plugin: PluginFactory = () => ({
      onTransitionSuccess(_toState, _fromState, opts) {
        receivedOpts(opts);
      },
    });

    router.usePlugin(plugin);

    await router.start("/");
    await router.navigate("admin.settings", {}, { replace: true });

    expect(receivedOpts).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true }),
    );

    router.stop();
  });

  it("extendRouter adds accessible properties", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    const remove = pluginApi.extendRouter({
      customMethod: () => "hello",
    });

    expect(
      (router as unknown as Record<string, () => string>).customMethod(),
    ).toBe("hello");

    remove();

    expect(
      (router as unknown as Record<string, unknown>).customMethod,
    ).toBeUndefined();
  });

  it("extendRouter conflict throws PLUGIN_CONFLICT", () => {
    const router = createFixtureRouter();
    const pluginApi = getPluginApi(router);

    expect(() => {
      pluginApi.extendRouter({ navigate: () => "conflict" });
    }).toThrowError(RouterError);

    expect(() => {
      pluginApi.extendRouter({ navigate: () => "conflict" });
    }).toThrowError(
      expect.objectContaining({ code: errorCodes.PLUGIN_CONFLICT }),
    );
  });
});

import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { useDeferred } from "../../src/composables/useDeferred";
import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

describe("useDeferred", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start();
  });

  afterEach(() => {
    router.stop();
  });

  function mountInRouter(setup: () => unknown): unknown {
    let captured: unknown;
    const Inner = defineComponent({
      setup() {
        captured = setup();

        return () => h("span", "x");
      },
    });

    mount(RouterProvider, {
      props: { router },
      slots: { default: () => h(Inner) },
    });

    return captured;
  }

  it("returns the promise registered under state.context.ssrDataDeferred[key]", () => {
    const promise = Promise.resolve(["r1"]);
    const state = router.getState()!;
    const mutated = {
      ...state,
      context: { ...state.context, ssrDataDeferred: { reviews: promise } },
    };

    Object.defineProperty(router, "getState", {
      value: () => mutated,
      configurable: true,
    });

    const captured = mountInRouter(() => useDeferred<string[]>("reviews"));

    expect(captured).toBe(promise);
  });

  it("returns a forever-pending promise when the key is missing", async () => {
    const captured = mountInRouter(() => useDeferred<string[]>("missing"));

    expect(captured).toBeInstanceOf(Promise);

    const winner = await Promise.race([
      (captured as Promise<unknown>).then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
  });

  it("returns a forever-pending promise when ssrDataDeferred is undefined", async () => {
    const captured = mountInRouter(() => useDeferred("reviews"));

    const winner = await Promise.race([
      (captured as Promise<unknown>).then(() => "settled"),
      Promise.resolve("microtask"),
    ]);

    expect(winner).toBe("microtask");
  });
});

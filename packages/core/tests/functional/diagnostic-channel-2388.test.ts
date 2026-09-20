import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * The diagnostic channel (#2388) — what core REPORTS rather than refuses.
 *
 * ⚑ **The twin of the check channel, and the split is the right handed out.** A
 * check may throw and stop the call; a diagnostic states what already happened
 * and cannot. `PluginApi.subscribeDiagnostic` is the only door.
 *
 * ⚠ **Internal keys, the shape `TREE_CHANGED` established.** They ride the
 * router's own emitter and are absent from the public `EventName` union, the
 * `events.*` registry and the `Plugin` interface — so `addEventListener` cannot
 * reach them and a diagnostic never spends a public event's listener budget.
 */
describe("the diagnostic channel (#2388)", () => {
  const routes = [{ name: "home", path: "/home" }];

  it("a subscriber receives the kind's payload", async () => {
    const router = createRouter(routes);
    const seen: string[] = [];

    getPluginApi(router).subscribeDiagnostic(
      "PLUGIN_AFTER_START",
      (methodName) => {
        seen.push(methodName);
      },
    );

    await router.start("/home");
    router.usePlugin(() => ({
      onStart() {
        /* registered after start, never called */
      },
    }));

    expect(seen).toStrictEqual(["onStart"]);

    router.stop();
  });

  it("unsubscribe stops delivery", async () => {
    const router = createRouter(routes);
    const heard = vi.fn();

    const remove = getPluginApi(router).subscribeDiagnostic(
      "PLUGIN_AFTER_START",
      heard,
    );

    await router.start("/home");
    remove();
    router.usePlugin(() => ({
      onStart() {
        /* registered after start, never called */
      },
    }));

    expect(heard).not.toHaveBeenCalled();

    router.stop();
  });

  it("a throwing handler does not break the operation that reported it", async () => {
    // ⚑ The emitter's per-listener isolation, and it is why a diagnostic is
    // safe where a check is not: reporting must never be worse than silence.
    const router = createRouter(routes);

    getPluginApi(router).subscribeDiagnostic("PLUGIN_AFTER_START", () => {
      throw new TypeError("broken diagnostic");
    });

    await router.start("/home");

    expect(() =>
      router.usePlugin(() => ({
        onStart() {
          /* registered after start, never called */
        },
      })),
    ).not.toThrow();

    router.stop();
  });

  it("a disposed router refuses the subscription, like its three siblings", () => {
    // ⚠ Not because an inert listener is harmful, but because
    // `RouterInternals` promises the refusals its guarded sibling makes
    // (#2259) — the check lives one layer down so the two doors stay one
    // function.
    const router = createRouter(routes);

    router.dispose();

    expect(() =>
      getPluginApi(router).subscribeDiagnostic("PLUGIN_AFTER_START", () => {}),
    ).toThrow();
  });

  it("ANTI-VACUUM: the reported operation works with nobody subscribed", async () => {
    const router = createRouter(routes);

    await router.start("/home");

    expect(() =>
      router.usePlugin(() => ({
        onStart() {
          /* registered after start, never called */
        },
      })),
    ).not.toThrow();

    router.stop();
  });
});

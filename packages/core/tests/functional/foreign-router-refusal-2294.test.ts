import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/**
 * A router core cannot find in its registry is one of THREE things, and until
 * #2294 the refusal called all three the same (#2294).
 *
 * Core identifies a router by object IDENTITY in a module-level `WeakMap`, so
 * `getInternals` misses for:
 *
 * 1. **an object that is not a router** — a test double, a wrong argument.
 *    `buildHref` accepts a `Router`-SHAPED object by contract, so this one must
 *    stay exactly as it was;
 * 2. **a PROXY over a real router** — `reactive()` / Pinia wrap it, and the
 *    proxy is a different key. Documented in `packages/vue/CLAUDE.md` with its
 *    remedy (`markRaw`), and the message never mentioned it;
 * 3. **a router built by ANOTHER COPY of `@real-router/core`** — two copies in
 *    one dependency tree, each with its own `WeakMap`. Reachable by ordinary
 *    resolution: core is a plain `dependency` of every adapter and plugin, so a
 *    caret range on a `0.x` version pins to the MINOR and an application that
 *    updates core without its adapter gets two.
 *
 * ⚑ **Cases 2 and 3 are REAL routers and case 1 is not, and that is the whole
 * split.** `[Symbol.for("real-router.router")]` answers it: a global symbol
 * crosses the module boundary, so a router from another copy carries it, and a
 * transparent proxy forwards the read — measured, both true. Nothing else on
 * the object does: `instanceof` and `#private in` are per-class and two copies
 * have two classes.
 *
 * ⚠ **The brand picks a MESSAGE, it does not gate behaviour.** That is why
 * `Symbol.for` is acceptable here where `packages/solid/.../components.tsx`
 * chose a local symbol against spoofing: forging this one buys a more helpful
 * error, not access. The WeakMap still decides who is served.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "old", path: "/old", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh" },
];

async function started(): Promise<Router> {
  const router = createRouter([...ROUTES]);

  await router.start("/");

  return router;
}

/** The message a call refused with, or `"ACCEPTED"`. */
function refusal(run: () => unknown): string {
  try {
    run();

    return "ACCEPTED";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("a router core cannot find says WHY (#2294)", () => {
  it("a PROXY over a real router is told it is a proxy, not an invalid object", async () => {
    const router = await started();
    const message = refusal(() => getPluginApi(new Proxy(router, {})));

    expect(message, "it refuses").not.toBe("ACCEPTED");
    expect(
      message,
      "the two reachable causes are named, so the reader can act",
    ).toMatch(/proxy|copies of/i);

    router.stop();
  });

  it("CONTROL — an object that is NOT a router keeps the message it had", async () => {
    // The contract `buildHref` depends on: a `Router`-shaped double is not a
    // router, and core must go on saying exactly that. Changing this message
    // would be a different change with different consumers.
    const message = refusal(() =>
      getPluginApi({ buildPath: () => "/" } as unknown as Router),
    );

    expect(message).toBe(
      "[real-router] Invalid router instance — not found in internals registry",
    );
  });

  it("CONTROL — a registered router is still accepted", async () => {
    // Without this the two cells above are equally true of a core that refuses
    // everything.
    const router = await started();

    expect(refusal(() => getPluginApi(router))).toBe("ACCEPTED");

    router.stop();
  });

  it("a candidate whose BRAND read throws is refused by core, not by the trap", async () => {
    // ⚠ The #1572 class: this diagnostic reads the caller's object, so it can
    // throw — and then the error comes FROM the diagnostic rather than from
    // core, which is the defect, not the report. The trap is selective because a
    // blanket one would throw before the WeakMap is even consulted.
    const router = await started();
    const hostile = new Proxy(router, {
      get(target, key, receiver) {
        if (key === Symbol.for("real-router.router")) {
          throw new Error("hostile get trap");
        }

        return Reflect.get(target, key, receiver) as unknown;
      },
    });

    expect(refusal(() => getPluginApi(hostile))).toBe(
      "[real-router] Invalid router instance — not found in internals registry",
    );

    router.stop();
  });

  it("the two refusals are DISTINGUISHABLE, which is the point", async () => {
    const router = await started();
    const viaProxy = refusal(() => getPluginApi(new Proxy(router, {})));
    const viaStub = refusal(() =>
      getPluginApi({ buildPath: () => "/" } as unknown as Router),
    );

    expect(viaProxy).not.toBe(viaStub);

    router.stop();
  });
});

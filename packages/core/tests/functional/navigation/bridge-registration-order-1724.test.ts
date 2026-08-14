import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import type { Router } from "@real-router/core";

/**
 * #1724 — the bridge records how to close itself only AFTER it has opened.
 *
 * Opening the cancellability scope is the `NAVIGATE` edge's action, so
 * `signal.addEventListener` — a call on the APPLICATION's own object — now runs
 * from inside `FSM.send`, which invokes an action with no try/catch and leaves
 * the machine in the new state when one escapes. By then the edge's `update`
 * has already published the plan as `ctx.inflight`.
 *
 * So a registration that THROWS must leave nothing recorded. Written the other
 * way round — closer first, listener second — the plan keeps a
 * `detachExternalBridge` that removes a listener which was never added, on a
 * signal that cannot remove it either. The next terminal edge calls it from
 * `handleCancel`, ABOVE `emitTransitionCancel`, so the throw takes out a
 * navigation that has nothing to do with the bad one.
 *
 * ⚠ **The trigger is not exotic: it is `{ signal: controller }`** — the
 * `AbortController` passed where its `.signal` belongs. Bare core tolerates the
 * shape (it is a programmer error `@real-router/validation-plugin` would
 * report), and the rejected navigation is the correct answer to it. What is not
 * an answer is the FOLLOWING navigation dying with a code-less `TypeError` and
 * no event at all — the deferred-crash shape core's invariant guards exist to
 * prevent.
 *
 * ⚠ **Counted, not traced.** The first navigation rejects with the same
 * `TypeError` either way, so its outcome never discriminates; what does is the
 * balance on the caller's signal and the fate of the navigation after it.
 */

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
];

const settle = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    (state) => `resolved:${(state as { name: string }).name}`,
    (error: unknown) => (error as Error).name,
  );

/**
 * A started router whose announce carries a pre-commit listener, so the early
 * bridge is the one that applies — and a counter for what that announce saw.
 */
async function announcingRouter(): Promise<{
  router: Router;
  starts: () => number;
}> {
  const router = createRouter(ROUTES);

  await router.start("/a");

  let starts = 0;

  // Registered AFTER start(), so the boot navigation is not counted.
  router.usePlugin(() => ({
    onTransitionStart: () => {
      starts += 1;
    },
  }));

  return { router, starts: () => starts };
}

describe("#1724 — a registration that throws records no closer", () => {
  it("the navigation AFTER an `{ signal: controller }` slip still lands", async () => {
    const { router, starts } = await announcingRouter();
    // The slip: an `AbortController` has `aborted === undefined` and no
    // `addEventListener`, so the entry pre-check lets it through and the
    // registration is what fails.
    const slip = new AbortController() as unknown as AbortSignal;

    // Positive control: the bridge branch really was reached — this is the
    // registration throwing, not a refusal upstream of it.
    await expect(
      settle(router.navigate("b", {}, undefined, { signal: slip })),
    ).resolves.toBe("TypeError");
    expect(starts()).toBe(0);

    // THE assertion: nothing of the dead navigation survives into the next one.
    await expect(settle(router.navigate("c"))).resolves.toBe("resolved:c");
    expect(starts()).toBe(1);
    expect(router.getState()?.name).toBe("c");
  });

  it("nothing is removed from a signal nothing was added to", async () => {
    const { router } = await announcingRouter();
    const controller = new AbortController();
    const { signal } = controller;
    let removed = 0;

    signal.addEventListener = (): never => {
      throw new TypeError("the application's own listener registry refused");
    };
    signal.removeEventListener = ((): void => {
      removed += 1;
    }) as typeof signal.removeEventListener;

    await expect(
      settle(router.navigate("b", {}, undefined, { signal })),
    ).resolves.toBe("TypeError");

    // Supersede the dead plan: this is the moment a recorded closer would run,
    // from the `CANCEL` action.
    await expect(settle(router.navigate("c"))).resolves.toBe("resolved:c");

    expect(removed).toBe(0);
  });
});

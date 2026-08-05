import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * #1649 — clearing a guard is BOOKKEEPING, never EXECUTION.
 *
 * `completeTransition`'s post-leave cleanup calls `clearCanDeactivate(name,
 * "external")`, and when a **definition** factory survives that clear the slot
 * is re-derived from it. That re-derivation used to INVOKE the factory —
 * application code running inside a destructive step, one commit away from the
 * send. It is the root the whole #1611 / #1626 / #1627 family grew from: a
 * factory that called `dispose()` / `stop()` / `navigate()` from there could
 * tear the router down mid-commit, and the answer each time was another guard
 * around the verdict.
 *
 * Since #1649 each factory's compiled form is stored beside it at registration,
 * so `#recompileSlot` is a `Map` read. No user code runs in the window, which is
 * why this file replaces `commit-after-teardown-1611.test.ts`: the scenarios
 * that file pinned are no longer reachable, and what needs pinning instead is
 * that they STAY unreachable. The mutational lock is the call COUNT — restoring
 * `compileFactory(effective)` in `#recompileSlot` fails every test here.
 *
 * The complementary half — a CANCELLED navigation must not run the (still
 * destructive) cleanup at all — lives in `commit-gate-1169.test.ts`; it is what
 * keeps the single remaining ask above the cleanup rather than before the send.
 */

interface Fixture {
  router: Router;
  log: string[];
  arm: () => void;
  factoryCalls: () => number;
}

/**
 * `home` carries BOTH a definition and an external `canDeactivate` — the only
 * shape that gives the post-leave cleanup a survivor to re-derive from.
 */
function createFixture(
  onCompile: (router: Router) => void = () => {},
  definitionVerdict = true,
): Fixture {
  const log: string[] = [];
  let armed = false;
  let calls = 0;
  let router!: Router;

  router = createRouter([
    {
      name: "home",
      path: "/",
      canDeactivate: () => {
        calls++;

        if (armed) {
          armed = false;
          onCompile(router);
        }

        return () => definitionVerdict;
      },
    },
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);

  router.usePlugin(() => ({
    onTransitionStart: (to) => log.push(`START:${to.name}`),
    onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
  }));

  getLifecycleApi(router).addDeactivateGuard("home", () => () => true);

  return {
    router,
    log,
    arm: () => {
      armed = true;
    },
    factoryCalls: () => calls,
  };
}

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string }).code;

describe("#1649 — a guard factory is compiled once, never re-run by a clear", () => {
  it("does not invoke the factory during the post-leave cleanup", async () => {
    const { router, factoryCalls } = createFixture();

    await router.start("/");

    // Everything before this point is legitimate compilation: the constructor's
    // `flushPendingGuards`. What must be zero is what the NAVIGATION adds.
    const compiledAtBoot = factoryCalls();

    expect(compiledAtBoot).toBeGreaterThan(0);

    const state = await router.navigate("a", {}, undefined, {
      forceDeactivate: true,
    });

    expect(state.name).toBe("a");
    expect(factoryCalls() - compiledAtBoot).toBe(0);
  });

  it("gives a dispose()-calling factory no window to run in", async () => {
    let disposed = false;
    const { router, log, arm } = createFixture((r) => {
      disposed = true;
      r.dispose();
    });

    await router.start("/");
    arm();

    const outcome = await router
      .navigate("a", {}, undefined, { forceDeactivate: true })
      .then(
        (state) => `resolved:${state.name}`,
        (error: unknown) => `rejected:${codeOf(error)}`,
      );

    // Before #1649 this rejected TRANSITION_CANCELLED, because the factory ran
    // and killed the router between the verdict and the send.
    expect(outcome).toBe("resolved:a");
    expect(disposed).toBe(false);
    expect(router.getState()?.name).toBe("a");
    expect(log).toContain("SUCCESS:a");
  });

  it("gives a stop()-calling factory no window to run in", async () => {
    let stopped = false;
    const { router, log, arm } = createFixture((r) => {
      stopped = true;
      r.stop();
    });

    await router.start("/");
    arm();

    const state = await router.navigate("a", {}, undefined, {
      forceDeactivate: true,
    });

    expect(state.name).toBe("a");
    expect(stopped).toBe(false);
    expect(router.isActive()).toBe(true);
    expect(log).toContain("SUCCESS:a");
  });

  it("gives a renavigating factory no window to supersede from", async () => {
    let renavigated = false;
    const { router, log, arm } = createFixture((r) => {
      renavigated = true;
      r.navigate("b").catch(() => {
        /* fire-and-forget */
      });
    });

    await router.start("/");
    arm();
    log.length = 0;

    const state = await router.navigate("a", {}, undefined, {
      forceDeactivate: true,
    });

    // No nested navigation exists to race the commit, so there is no
    // "who superseded whom" question left to answer.
    expect(state.name).toBe("a");
    expect(renavigated).toBe(false);
    expect(log).toStrictEqual(["START:a", "SUCCESS:a"]);
  });

  /**
   * The mirror case, and the one the fixture above cannot reach.
   *
   * `#registerHandler` stores the compiled form for EVERY origin — including the
   * definition compile that external-wins immediately discards. That line is
   * what makes a later clear a read rather than a re-compile, and it only runs
   * when a definition guard is registered while an external one is already
   * live. `createFixture` registers definition-first (route config, then
   * `addDeactivateGuard`), so `externalWins` is false there and the branch is
   * never taken; route CRUD installing a definition guard under a live external
   * one is the way in.
   *
   * Mutationally validated: gating the store on `!externalWins` leaves the whole
   * tier green and makes THIS navigation resolve — the definition guard is
   * silently lost the moment the external one is cleared, which is precisely the
   * "external guards survive, definition guards re-take the slot" contract
   * (#1174 / #1192) that the compiled twin exists to keep.
   */
  it("keeps the DISCARDED external-wins compile, so the definition guard can retake the slot", async () => {
    let definitionGuardCalls = 0;

    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    const lifecycle = getLifecycleApi(router);

    // EXTERNAL first — it allows.
    lifecycle.addDeactivateGuard("home", () => () => true);

    // DEFINITION second, under the live external: `externalWins` is true, the
    // compiled function is NOT installed into the effective slot, and the only
    // record of it is the compiled twin. It REFUSES, so its arrival is visible.
    getRoutesApi(router).update("home", {
      canDeactivate: () => () => {
        definitionGuardCalls++;

        return false;
      },
    });

    await router.start("/");

    // Clearing the external guard hands the slot back to the definition one —
    // by READING its stored compiled form, since #1649.
    lifecycle.removeDeactivateGuard("home");

    const outcome = await router.navigate("a").then(
      (state) => `resolved:${state.name}`,
      (error: unknown) => `rejected:${codeOf(error)}`,
    );

    expect(outcome).toBe(`rejected:${errorCodes.CANNOT_DEACTIVATE}`);
    expect(definitionGuardCalls).toBe(1);
    expect(router.getState()?.name).toBe("home");
  });

  it("still re-derives the surviving DEFINITION guard into the slot", async () => {
    // Read-instead-of-recompile has to produce the same effective guard the
    // re-compile did: external wins while both live, and the definition one
    // takes the slot the moment the external is cleared (#1174 / #1192).
    const { router, factoryCalls } = createFixture(
      () => {
        /* well-behaved */
      },
      // The definition guard REFUSES, so its arrival in the slot is observable.
      false,
    );

    await router.start("/");

    const compiledAtBoot = factoryCalls();

    // The external guard (which allows) is still effective here; leaving also
    // runs the post-leave cleanup, which clears it.
    await router.navigate("a");

    expect(router.getState()?.name).toBe("a");

    await router.navigate("home");

    // Now the definition guard owns the slot — and it refuses.
    const outcome = await router.navigate("b").then(
      (state) => `resolved:${state.name}`,
      (error: unknown) => `rejected:${codeOf(error)}`,
    );

    expect(outcome).toBe(`rejected:${errorCodes.CANNOT_DEACTIVATE}`);
    expect(router.getState()?.name).toBe("home");
    // ...and it got there without the factory being run a second time.
    expect(factoryCalls() - compiledAtBoot).toBe(0);
  });
});

/**
 * Probe 03 (wave 2, 2026-07-03): reentrancy model after RFC §4 (#1030-#1035).
 *
 * Wave-1 baseline saw the old #935 model (reentrancy bound / RecursionDepthError).
 * The current model: a SYNCHRONOUS reentrant navigate() from inside a sync
 * leave listener throws RouterError(REENTRANT_NAVIGATION) at the facade,
 * surfaced via onListenerError (console.error), NOT crashing the navigation.
 *
 * Matrix:
 *  (a) sync navigate() from sync leave listener → REENTRANT_NAVIGATION thrown
 *      into listener (isolated), outer navigate COMPLETES
 *  (b) deferred navigate from async listener (after await) → allowed, supersedes
 *  (c) subscribeLeave(other) from inside listener → other NOT called this cycle
 *      (snapshot), called next cycle
 *  (d) unsubscribe(self) from inside listener → still snapshot-called this
 *      cycle, absent next cycle
 *  (e) stop() from sync leave listener → navigate rejects TRANSITION_CANCELLED
 *  (f) dispose() from sync leave listener → navigate rejects, router disposed,
 *      no crash
 */

import { createRouter, errorCodes } from "@real-router/core";

import type { RouterError } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
  { name: "b", path: "/b" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

void (async () => {
  // ===== (a) sync reentrant navigate from sync leave listener =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let listenerError: unknown;
    router.subscribeLeave(() => {
      try {
        void router.navigate("b");
      } catch (error) {
        listenerError = error;
      }
    });
    const state = await router.navigate("target");
    report(
      "(a) sync reentrant navigate → REENTRANT_NAVIGATION thrown synchronously",
      (listenerError as RouterError | undefined)?.code ===
        errorCodes.REENTRANT_NAVIGATION,
      `code=${String((listenerError as RouterError | undefined)?.code)}`,
    );
    report(
      "(a) outer navigate completes normally",
      state.name === "target" && router.getState()?.name === "target",
      `state=${String(router.getState()?.name)}`,
    );
  }

  // ===== (b) deferred navigate from async listener =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let innerNav: Promise<unknown> | undefined;
    let once = true;
    router.subscribeLeave(async () => {
      if (once) {
        once = false;
        await Promise.resolve(); // defer past the sync dispatch window
        innerNav = router.navigate("b").catch((e: unknown) => e);
      }
    });
    const err = (await router
      .navigate("target")
      .catch((e: unknown) => e)) as RouterError;
    const innerResult = await innerNav;
    report(
      "(b) deferred navigate from async listener supersedes outer",
      err.code === errorCodes.TRANSITION_CANCELLED,
      `outer.code=${String(err.code)}`,
    );
    report(
      "(b) inner navigate commits",
      (innerResult as { name?: string } | undefined)?.name === "b" &&
        router.getState()?.name === "b",
      `state=${String(router.getState()?.name)}`,
    );
  }

  // ===== (c) subscribeLeave(other) from inside listener — snapshot =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const calls: string[] = [];
    router.subscribeLeave(() => {
      calls.push("first");
      router.subscribeLeave(() => {
        calls.push("late-registered");
      });
    });
    await router.navigate("target");
    const afterFirstNav = calls.join(",");
    await router.navigate("b");
    report(
      "(c) listener registered mid-emit NOT called same cycle (snapshot)",
      afterFirstNav === "first",
      `afterFirstNav=[${afterFirstNav}]`,
    );
    report(
      "(c) …but called on the NEXT navigation",
      calls.includes("late-registered"),
      `calls=[${calls.join(",")}]`,
    );
  }

  // ===== (d) unsubscribe(self) from inside listener =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let selfCalls = 0;
    const unsub = router.subscribeLeave(() => {
      selfCalls++;
      unsub();
    });
    await router.navigate("target");
    await router.navigate("b");
    report(
      "(d) self-unsubscribing listener fires exactly once",
      selfCalls === 1,
      `selfCalls=${selfCalls}`,
    );
  }

  // ===== (e) stop() from sync leave listener =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(() => {
      router.stop();
    });
    const err = (await router
      .navigate("target")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(e) stop() inside sync leave listener → navigate rejects TRANSITION_CANCELLED",
      err.code === errorCodes.TRANSITION_CANCELLED,
      `code=${String(err.code)} isActive=${String(router.isActive())}`,
    );
  }

  // ===== (f) dispose() from sync leave listener =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    router.subscribeLeave(() => {
      router.dispose();
    });
    const err = (await router
      .navigate("target")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(f) dispose() inside sync leave listener → navigate rejects (no crash)",
      err.code === errorCodes.TRANSITION_CANCELLED,
      `code=${String(err.code)}`,
    );
    let disposedThrow: unknown;
    try {
      router.subscribeLeave(() => {});
    } catch (error) {
      disposedThrow = error;
    }
    report(
      "(f) router fully disposed afterwards (subscribeLeave throws ROUTER_DISPOSED)",
      (disposedThrow as RouterError | undefined)?.code ===
        errorCodes.ROUTER_DISPOSED,
      `code=${String((disposedThrow as RouterError | undefined)?.code)}`,
    );
  }

  console.log("\nprobe-03 done");
})();

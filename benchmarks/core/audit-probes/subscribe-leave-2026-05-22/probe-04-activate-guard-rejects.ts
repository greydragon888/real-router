/**
 * Probe 04: «departure is certain» — additional boundary violations.
 *
 * Row #9 of navigate-deep audit already verified: activate-guard that REMOVES
 * the target route → subscribeLeave fired but state stays at fromState.
 *
 * This probe checks **additional** boundary scenarios:
 *
 *  (1) activate-guard returns false → CANNOT_ACTIVATE
 *      Expected: subscribeLeave WAS called (already covered by
 *      leave-approve-integration.test.ts:398), state stays at home.
 *      Question: is this a violation? Wiki/CLAUDE say "departure is certain"
 *      after subscribeLeave. State did NOT change. So departure was NOT certain.
 *      → Doc/code drift OR designed behaviour: cleanup must use signal.aborted.
 *
 *  (2) activate-guard throws → CANNOT_ACTIVATE
 *  (3) activate-guard returns Promise<false>
 *  (4) activate-guard throws AbortError → TRANSITION_CANCELLED
 *  (5) concurrent navigate aborts after LEAVE_APPROVE
 *  (6) Listener's signal is aborted in these cases?
 */

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

async function check(
  scenario: string,
  setup: (router: ReturnType<typeof createRouter>) => Promise<void>,
) {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "target", path: "/target" },
  ]);
  await router.start("/");

  let leaveFired = false;
  let signalAtCallTime: boolean | undefined;
  let signalAfterAwait: boolean | undefined;
  let signalInstance: AbortSignal | undefined;

  router.subscribeLeave(async ({ signal }) => {
    leaveFired = true;
    signalAtCallTime = signal.aborted;
    signalInstance = signal;
    await new Promise((r) => setTimeout(r, 30));
    signalAfterAwait = signal.aborted;
  });

  await setup(router);

  const result = await router.navigate("target").catch((e) => e);
  await new Promise((r) => setTimeout(r, 50));

  const state = router.getState();
  console.log(`\n[${scenario}]`);
  console.log("  subscribeLeave fired:        ", leaveFired);
  console.log("  state after nav:             ", state?.name);
  console.log("  signal at call:              ", signalAtCallTime);
  console.log("  signal after await:          ", signalAfterAwait);
  console.log("  signal.reason:               ", signalInstance?.reason);
  console.log("  navigate result:             ", (result as { code?: string })?.code ?? "ok");

  if (leaveFired && state?.name === "home") {
    console.log(
      "  ⚠ contract «departure is certain» violated for scenario:",
      scenario,
    );
  }
}

async function main() {
  await check("1. activate returns false", async (r) => {
    getLifecycleApi(r).addActivateGuard("target", () => () => false);
  });

  await check("2. activate throws", async (r) => {
    getLifecycleApi(r).addActivateGuard("target", () => () => {
      throw new Error("synthetic activate error");
    });
  });

  await check("3. activate returns Promise<false>", async (r) => {
    getLifecycleApi(r).addActivateGuard(
      "target",
      () => async () => false,
    );
  });

  await check("4. activate throws AbortError", async (r) => {
    getLifecycleApi(r).addActivateGuard("target", () => () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
  });

  await check("5. activate returns Promise.reject", async (r) => {
    getLifecycleApi(r).addActivateGuard("target", () => async () => {
      await Promise.resolve();
      throw new Error("synthetic async activate error");
    });
  });

  // 6. concurrent navigate after async leave
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
    await router.start("/");

    let leaveFired = false;
    let signal: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal: s }) => {
      leaveFired = true;
      signal = s;
      await new Promise((r) => setTimeout(r, 100));
    });

    const navA = router.navigate("a");
    await new Promise((r) => setTimeout(r, 30));
    const navB = router.navigate("b");

    await navA.catch(() => {});
    await navB.catch(() => {});

    console.log("\n[6. concurrent navigate during async leave]");
    console.log("  leaveFired (A):  ", leaveFired);
    console.log("  signal.aborted:  ", signal?.aborted);
    console.log("  final state:     ", router.getState()?.name);
    console.log(
      "  contract violated for A:",
      leaveFired && router.getState()?.name !== "a",
      "(expected — concurrent aborts the active nav)",
    );
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});

/**
 * Probe 02: signal.reason propagation in LeaveState.signal.
 *
 * Two questions:
 * (a) When a concurrent navigate aborts the leave signal, what is signal.reason?
 *     - internal RouterError(TRANSITION_CANCELLED), or
 *     - external user-passed signal's reason (if opts.signal aborts mid-leave), or
 *     - undefined / generic AbortError?
 *
 * (b) When user-passed opts.signal aborts during async leave listener, does
 *     leave-listener's signal abort with the SAME reason instance, or different?
 *
 * Expected behaviour per docs (wiki/leave.md L188): "When a concurrent
 * navigation starts during an async leave listener, the signal is aborted."
 * — does NOT specify what `reason` is set to.
 */

import { createRouter, errorCodes } from "@real-router/core";

async function main() {
  // ===== Case A: concurrent navigate cancellation =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
    await router.start("/");

    let firstSignal: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      firstSignal = signal;
      await new Promise((r) => setTimeout(r, 50));
    });

    const navA = router.navigate("a");
    await new Promise((r) => setTimeout(r, 10));
    const navB = router.navigate("b");

    await navA.catch(() => {});
    await navB.catch(() => {});

    console.log("[A] firstSignal.aborted:", firstSignal?.aborted);
    console.log("[A] firstSignal.reason:", firstSignal?.reason);
    console.log(
      "[A] reason is RouterError(TRANSITION_CANCELLED):",
      (firstSignal?.reason as { code?: string } | undefined)?.code ===
        errorCodes.TRANSITION_CANCELLED,
    );
  }

  // ===== Case B: external opts.signal aborts during async leave =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    let leaveSignal: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      leaveSignal = signal;
      await new Promise((r) => setTimeout(r, 100));
    });

    const externalCtrl = new AbortController();
    const customReason = new Error("USER_REASON_CUSTOM");

    const nav = router.navigate("a", undefined, {
      signal: externalCtrl.signal,
    });

    await new Promise((r) => setTimeout(r, 20));
    externalCtrl.abort(customReason);

    await nav.catch(() => {});

    console.log("[B] leaveSignal.aborted:", leaveSignal?.aborted);
    console.log(
      "[B] leaveSignal.reason:",
      (leaveSignal?.reason as Error | undefined)?.message,
    );
    console.log(
      "[B] is USER_REASON_CUSTOM:",
      (leaveSignal?.reason as Error | undefined)?.message ===
        "USER_REASON_CUSTOM",
    );
  }

  // ===== Case C: dispose during async leave =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    let disposeSignal: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      disposeSignal = signal;
      await new Promise((r) => setTimeout(r, 100));
    });

    const nav = router.navigate("a");
    await new Promise((r) => setTimeout(r, 20));
    router.dispose();
    await nav.catch(() => {});

    console.log("[C-dispose] signal.aborted:", disposeSignal?.aborted);
    console.log("[C-dispose] signal.reason:", disposeSignal?.reason);
  }

  // ===== Case D: stop during async leave =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    let stopSignal: AbortSignal | undefined;
    router.subscribeLeave(async ({ signal }) => {
      stopSignal = signal;
      await new Promise((r) => setTimeout(r, 100));
    });

    const nav = router.navigate("a");
    await new Promise((r) => setTimeout(r, 20));
    router.stop();
    await nav.catch(() => {});

    console.log("[D-stop] signal.aborted:", stopSignal?.aborted);
    console.log("[D-stop] signal.reason:", stopSignal?.reason);
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});

// probe-11: (a) #dispatchDepth windows — the reentrant-navigate ban (#1030)
// must hold inside EVERY transition-event dispatch (START / LEAVE_APPROVE /
// SUCCESS / ERROR / CANCEL), proving isProcessing() covers all five emit
// methods (EventBusNamespace.ts:156-207). (b) cancel-reason threading (#943):
// an external opts.signal abort reason must surface as the subscribeLeave
// payload signal.reason via sendCancelIfPossible(reason).
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { EventName } from "@real-router/core";

void (async () => {
  // --- (a) ban inside each of the five transition-event windows ---
  const results: string[] = [];

  const mk = () =>
    createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "blocked", path: "/blocked", canActivate: () => () => false },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => () =>
          new Promise<boolean>((res) => setTimeout(() => res(true), 30)),
      },
    ]);

  async function probeWindow(
    label: string,
    eventName: EventName,
    trigger: (r: ReturnType<typeof mk>) => Promise<unknown>,
  ): Promise<void> {
    const r = mk();

    await r.start("/");

    let observed = "listener-not-called";

    getPluginApi(r).addEventListener(eventName, () => {
      try {
        void r.navigate("a");
        observed = "no-throw (ban NOT active in this window)";
      } catch (e) {
        observed = `threw:${(e as { code?: string }).code}`;
      }
    });

    await trigger(r).catch(() => {});
    // settle any async tail
    await new Promise((res) => setTimeout(res, 60));
    results.push(`${label}: ${observed}`);
  }

  await probeWindow("TRANSITION_START", "$$start" as EventName, (r) => r.navigate("a"));
  await probeWindow("TRANSITION_SUCCESS", "$$success" as EventName, (r) => r.navigate("a"));
  await probeWindow("TRANSITION_ERROR", "$$error" as EventName, (r) => r.navigate("blocked"));
  await probeWindow("LEAVE_APPROVE", "$$leaveApprove" as EventName, async (r) => {
    r.subscribeLeave(() => {});

    return r.navigate("a");
  });
  await probeWindow("TRANSITION_CANCEL", "$$cancel" as EventName, async (r) => {
    const slow = r.navigate("slow").catch(() => {});
    const fast = r.navigate("a").catch(() => {});

    return Promise.all([slow, fast]);
  });

  for (const line of results) {
    console.log(`a. ${line}`);
  }

  // --- (b) external signal abort reason → leave signal.reason (#943) ---
  {
    const r = mk();

    await r.start("/");

    let leaveReason = "signal-not-aborted";
    const seen = new Promise<void>((resolve) => {
      r.subscribeLeave(({ signal }) => {
        signal.addEventListener("abort", () => {
          leaveReason = String((signal.reason as Error)?.message ?? signal.reason);
          resolve();
        });

        // hold the pipeline long enough for the abort to land mid-flight
        return new Promise<void>((res) => setTimeout(res, 50));
      });
    });

    const ctl = new AbortController();
    const nav = r.navigate("a", {}, { signal: ctl.signal }).then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );

    setTimeout(() => ctl.abort(new Error("external-reason-42")), 10);

    const navOut = await nav;

    await Promise.race([seen, new Promise((res) => setTimeout(res, 200))]);
    console.log(`b. external abort: navigate=${navOut} leave signal.reason="${leaveReason}" (expect external-reason-42)`);
  }
})();

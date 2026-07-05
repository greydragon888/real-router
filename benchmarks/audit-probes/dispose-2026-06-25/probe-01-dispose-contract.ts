/**
 * Probe 01: router.dispose() CONTRACT BEHAVIOR — focused mini-audit.
 *
 * Verifies (via the PUBLIC API only — createRouter / getPluginApi /
 * getLifecycleApi) the dispose() behaviors the audit prompt flags as "known
 * risks" or open questions, to separate genuine bugs from already-closed risks
 * and from test-gaps (correct-but-unasserted behavior).
 *
 * Each question prints `наблюдение + вердикт`. Run:
 *   npx tsx benchmarks/audit-probes/dispose-2026-06-25/probe-01-dispose-contract.ts
 *
 * Source under test:
 *   Router.ts dispose() (505-546) — no try/catch around the chain; markDisposed
 *     (748-759) runs LAST; sendCancelIfPossible (512) before sendDispose (519).
 *   PluginsNamespace.disposeAll (203-210) + per-unsubscribe try/catch (105-109).
 *   NavigationNamespace.abortCurrentNavigation (276-281).
 */

import { createRouter, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { PluginFactory } from "@real-router/core";

function mkRouter() {
  return createRouter([
    { name: "home", path: "/home" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "list", path: "/list" }],
    },
    { name: "orders", path: "/orders" },
  ]);
}

function line(q: string, observation: string, verdict: string): void {
  console.log(`\n[${q}] ${observation}\n      → ВЕРДИКТ: ${verdict}`);
}

async function codeOf(thunk: () => Promise<unknown>): Promise<string> {
  // Wrap invocation too: after dispose, facade methods are replaced with
  // `throwDisposed`, which throws SYNCHRONOUSLY (it does not return a rejected
  // promise). So the thunk itself can throw before any promise exists.
  try {
    await thunk();

    return "<resolved, no throw>";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function main(): Promise<void> {
  // ── Q1: teardown throw isolation + markDisposed STILL reached ──────────────
  {
    const router = mkRouter();
    const goodTeardown = { ran: false };

    router.usePlugin(() => ({
      teardown: () => {
        throw new Error("boom in teardown");
      },
    }));
    router.usePlugin(() => ({
      teardown: () => {
        goodTeardown.ran = true;
      },
    }));
    await router.start("/home");

    let disposeThrew = false;

    try {
      router.dispose();
    } catch {
      disposeThrew = true;
    }

    // markDisposed runs only if disposeAll did NOT propagate the teardown throw.
    const navCode = await codeOf(() => router.navigate("home"));

    line(
      "Q1 teardown-throw non-blocking",
      `dispose() threw=${disposeThrew}; good-plugin teardown ran=${goodTeardown.ran}; post-dispose navigate code=${navCode}`,
      disposeThrew === false &&
        goodTeardown.ran === true &&
        navCode === errorCodes.ROUTER_DISPOSED
        ? "CLOSED — teardown throw isolated; markDisposed STILL runs"
        : "ANOMALY — chain blocked by teardown throw",
    );
  }

  // ── Q2: teardown calls router.dispose() (reentrant recursion) ──────────────
  {
    const router = mkRouter();
    let teardownCalls = 0;

    router.usePlugin(() => ({
      teardown: () => {
        teardownCalls++;
        router.dispose(); // reentrant
      },
    }));
    await router.start("/home");

    let threw = false;

    try {
      router.dispose();
    } catch {
      threw = true;
    }

    line(
      "Q2 reentrant dispose() from teardown",
      `teardown invocations=${teardownCalls}; outer dispose threw=${threw}`,
      teardownCalls === 1 && !threw
        ? "CLOSED — idempotency early-return (FSM already DISPOSED) blocks recursion"
        : "ANOMALY",
    );
  }

  // ── Q3: teardown calls router.usePlugin(another) — registration mid-cleanup ─
  {
    const router = mkRouter();
    const late = { teardownRan: false };
    const lateFactory: PluginFactory = () => ({
      teardown: () => {
        late.teardownRan = true;
      },
    });

    router.usePlugin(() => ({
      teardown: () => {
        router.usePlugin(lateFactory); // register during disposeAll loop
      },
    }));
    await router.start("/home");

    let threw: string | boolean = false;

    try {
      router.dispose();
    } catch (e) {
      threw = String((e as { code?: string }).code ?? e);
    }

    line(
      "Q3 usePlugin() from teardown",
      `dispose threw=${threw}; late plugin teardown ran=${late.teardownRan}`,
      threw === false
        ? `no crash — late teardown ran=${late.teardownRan} (Set-iteration visits the entry added mid-loop)`
        : "ANOMALY — threw",
    );
  }

  // ── Q4: teardown calls extendRouter() — what actually happens? ─────────────
  {
    const router = mkRouter();
    let extendOutcome = "<none>";

    router.usePlugin((r) => ({
      teardown: () => {
        // extendRouter is an API-LAYER method guarded by throwIfDisposed (FSM
        // check). At teardown time the FSM is ALREADY DISPOSED (sendDispose ran
        // before disposeAll), so this throws — unlike the facade navigate()
        // in Q5 which is not yet replaced by markDisposed.
        try {
          getPluginApi(r).extendRouter({ lateExt: 123 });
          extendOutcome = "<added, no throw>";
        } catch (e) {
          extendOutcome = (e as { code?: string }).code ?? String(e);
        }
      },
    }));
    await router.start("/home");
    router.dispose();

    const leaked = "lateExt" in (router as Record<string, unknown>);

    line(
      "Q4 extendRouter() from teardown",
      `extend outcome=${extendOutcome}; "lateExt" present after dispose=${leaked}`,
      leaked === false
        ? `no leak — extendRouter threw ${extendOutcome} (api-layer throwIfDisposed: FSM already DISPOSED at teardown), so the extension is NEVER added. The Router.ts:527-533 safety-net targets a different case: extensions added BEFORE dispose that a teardown fails to remove.`
        : "ANOMALY — extension leaked",
    );
  }

  // ── Q5: teardown calls navigate() — actual error code (prompt says ROUTER_DISPOSED) ─
  {
    const router = mkRouter();
    let observedCode = "<none>";

    router.usePlugin(() => ({
      teardown: () => {
        // navigate is still the LIVE method here (markDisposed runs AFTER
        // disposeAll), but the FSM is already DISPOSED (sendDispose ran before
        // disposeAll), so canNavigate() is false → cached NOT_STARTED rejection.
        router.navigate("orders").then(
          () => {
            observedCode = "<resolved>";
          },
          (e: { code?: string }) => {
            observedCode = e.code ?? String(e);
          },
        );
      },
    }));
    await router.start("/home");
    router.dispose();
    await Promise.resolve();
    await Promise.resolve();

    line(
      "Q5 navigate() from teardown — actual code",
      `prompt EXPECTED=ROUTER_DISPOSED; ACTUAL=${observedCode}`,
      observedCode === errorCodes.ROUTER_DISPOSED
        ? "matches prompt"
        : `DIVERGES from prompt — actual is ${observedCode} (FSM already DISPOSED but markDisposed not yet run → not ROUTER_DISPOSED). Niche/undocumented transient.`,
    );
  }

  // ── Q6: second dispose() emits NO events (idempotency "no extra events") ───
  {
    const router = mkRouter();
    const seen: string[] = [];

    getPluginApi(router).addEventListener(events.ROUTER_STOP, () => {
      seen.push("ROUTER_STOP");
    });
    getPluginApi(router).addEventListener(events.TRANSITION_CANCEL, () => {
      seen.push("TRANSITION_CANCEL");
    });
    await router.start("/home");
    router.dispose(); // clears listeners during clearAll
    const afterFirst = [...seen];

    router.dispose(); // second call — must be a pure no-op
    const afterSecond = [...seen];

    line(
      "Q6 second dispose() emits no events",
      `events after 1st dispose=${JSON.stringify(afterFirst)}; after 2nd=${JSON.stringify(afterSecond)}`,
      afterFirst.length === afterSecond.length
        ? "CORRECT behavior — 2nd dispose emits nothing (but UNASSERTED in suite → Test-gap)"
        : "ANOMALY — 2nd dispose emitted extra events",
    );
  }

  // ── Q7: subscribeLeave signal aborts on dispose ───────────────────────────
  {
    const router = mkRouter();
    let captured: AbortSignal | undefined;

    router.subscribeLeave((payload) => {
      captured = payload.signal;

      return new Promise<void>(() => {
        /* never settles — parks navigation in LEAVE_APPROVED */
      });
    });
    await router.start("/home");
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    router.navigate("orders");
    await new Promise((r) => setTimeout(r, 0)); // let leave listener run

    const abortedBefore = captured?.aborted;

    router.dispose();
    const abortedAfter = captured?.aborted;

    line(
      "Q7 subscribeLeave signal aborts on dispose",
      `signal captured=${captured !== undefined}; aborted before dispose=${abortedBefore}; after dispose=${abortedAfter}`,
      captured !== undefined && abortedBefore === false && abortedAfter === true
        ? "CLOSED — abortCurrentNavigation() aborts the leave signal on dispose"
        : "ANOMALY",
    );
  }

  // ── H2: is dispose.test.ts:75 "during TRANSITION_STARTED" actually READY? ──
  {
    const router = mkRouter();

    await router.start("/home");
    // users.list has NO guards → navigate resolves SYNCHRONOUSLY
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    router.navigate("users.list").catch(() => {});

    const committed = router.getState()?.name;
    const leaveApproved = router.isLeaveApproved();

    line(
      "H2 guardless navigate FSM state at next sync line",
      `getState().name immediately after navigate=${committed}; isLeaveApproved=${leaveApproved}`,
      committed === "users.list"
        ? 'CONFIRMED — guardless navigate resolved SYNC → FSM=READY. So dispose.test.ts:75 "during TRANSITION_STARTED" actually disposes from READY. Genuine TRANSITION_STARTED (async deactivation guard pending) is UNCOVERED.'
        : `FSM not READY (committed=${committed}) — re-examine`,
    );

    router.dispose();
  }

  // ── H1: dispose mid in-flight ASYNC nav emits TRANSITION_CANCEL? ───────────
  // (a) parked in TRANSITION_STARTED via pending async DEACTIVATION guard
  {
    const router = mkRouter();
    let cancelFired = 0;
    let errorFired = 0;
    let releaseGuard: ((v: boolean) => void) | undefined;

    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancelFired++;
      },
      onTransitionError: () => {
        errorFired++;
      },
    }));
    const lifecycle = getLifecycleApi(router);

    await router.start("/home");
    // async DEACTIVATION guard on the FROM route → parks in TRANSITION_STARTED
    lifecycle.addDeactivateGuard(
      "home",
      () => () =>
        new Promise<boolean>((resolve) => {
          releaseGuard = resolve;
        }),
    );

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    router.navigate("orders").catch(() => {});
    await new Promise((r) => setTimeout(r, 0));

    const leaveApprovedMid = router.isLeaveApproved();
    const committedMid = router.getState()?.name; // should still be "home" (not committed)

    router.dispose();
    releaseGuard?.(true);
    await new Promise((r) => setTimeout(r, 0));

    line(
      "H1a dispose mid TRANSITION_STARTED (async deactivate guard)",
      `mid-nav isLeaveApproved=${leaveApprovedMid} committed=${committedMid}; onTransitionCancel fired=${cancelFired}; onTransitionError fired=${errorFired}`,
      cancelFired === 1
        ? "CORRECT — dispose emits TRANSITION_CANCEL once (sendCancelIfPossible BEFORE sendDispose). UNASSERTED in suite → Test-gap."
        : `OBSERVE — cancel fired ${cancelFired}× (error ${errorFired}×)`,
    );
  }

  // (b) parked in LEAVE_APPROVED via pending async ACTIVATION guard
  {
    const router = mkRouter();
    let cancelFired = 0;
    let releaseGuard: ((v: boolean) => void) | undefined;

    router.usePlugin(() => ({
      onTransitionCancel: () => {
        cancelFired++;
      },
    }));
    const lifecycle = getLifecycleApi(router);

    await router.start("/home");
    lifecycle.addActivateGuard(
      "users.list",
      () => () =>
        new Promise<boolean>((resolve) => {
          releaseGuard = resolve;
        }),
    );

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    router.navigate("users.list").catch(() => {});
    await new Promise((r) => setTimeout(r, 0));

    const leaveApprovedMid = router.isLeaveApproved();

    router.dispose();
    releaseGuard?.(true);
    await new Promise((r) => setTimeout(r, 0));

    line(
      "H1b dispose mid LEAVE_APPROVED (async activate guard)",
      `mid-nav isLeaveApproved=${leaveApprovedMid}; onTransitionCancel fired=${cancelFired}`,
      cancelFired === 1
        ? "CORRECT — dispose emits TRANSITION_CANCEL once from LEAVE_APPROVED too. UNASSERTED → Test-gap."
        : `OBSERVE — cancel fired ${cancelFired}×`,
    );
  }

  console.log("\n=== probe-01 complete ===");
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

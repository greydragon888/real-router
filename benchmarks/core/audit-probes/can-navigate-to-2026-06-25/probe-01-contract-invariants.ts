/**
 * Probe 01: canNavigateTo contract invariants (behavioral).
 *
 * One file, N focused questions. Each prints `observation + verdict`.
 * Verifies by-design claims and hunts for PARITY drift vs navigate:
 *   Q1  NO_STATE_MUTATION  — getState() ref identical before/after
 *   Q2  NO_SUBSCRIBE_FIRE  — subscribe + subscribeLeave spies not called
 *   Q3  NO_FSM_TRANSITION  — isLeaveApproved() unchanged, no transition committed
 *   Q4  SYNC_RETURN        — async guard ⇒ sync `false`, never a Promise
 *   Q5  SAME_STATE         — canNavigateTo vs navigate(SAME_STATES) divergence
 *   Q6  SIGNAL             — guard's 3rd arg in canNavigateTo vs navigate
 *   Q7  PARITY pass/block  — canNavigateTo verdict == navigate resolve/reject
 *   Q8  DEACTIVATE_PARITY  — current-route deactivate guard honored
 *   Q9  REENTRANCY         — canNavigateTo inside its own guard (bounded/unbounded)
 *   Q10 DISPOSE            — throws ROUTER_DISPOSED after dispose()
 *   Q11 BEFORE_START       — callable before start() (no FSM gate)
 *   Q12 UNDEFINED_PARAM    — { x: undefined } param key handling vs navigate
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/" },
        { name: "view", path: "/:id" },
      ],
    },
    {
      name: "admin",
      path: "/admin",
      children: [
        { name: "dashboard", path: "/" },
        { name: "settings", path: "/settings" },
      ],
    },
  ];
}

const fresh = () => createRouter(makeRoutes());
/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? (e as any)?.message ?? String(e);

async function main(): Promise<void> {
  // -------------------------------------------------------------- Q1
  {
    const r = fresh();
    await r.start("/users");
    const before = r.getState();
    r.canNavigateTo("admin");
    const after = r.getState();
    console.log(
      `Q1  NO_STATE_MUTATION : ${before === after ? "PASS (same ref)" : "FAIL (ref changed)"}`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q2 + Q3
  {
    const r = fresh();
    await r.start("/users");
    let sub = 0;
    let leave = 0;
    r.subscribe(() => {
      sub++;
    });
    r.subscribeLeave(() => {
      leave++;
    });
    const approvedBefore = r.isLeaveApproved();
    r.canNavigateTo("admin");
    r.canNavigateTo("home");
    const approvedAfter = r.isLeaveApproved();
    console.log(
      `Q2  NO_SUBSCRIBE_FIRE : ${sub === 0 && leave === 0 ? "PASS" : `FAIL sub=${sub} leave=${leave}`}`,
    );
    console.log(
      `Q3  NO_FSM_TRANSITION : ${approvedBefore === false && approvedAfter === false ? "PASS (isLeaveApproved stays false)" : `FAIL before=${approvedBefore} after=${approvedAfter}`}`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q4
  {
    const r = fresh();
    getLifecycleApi(r).addActivateGuard("admin", () => async () => true);
    await r.start("/home");
    const res: unknown = r.canNavigateTo("admin");
    console.log(
      `Q4  SYNC_RETURN       : typeof=${typeof res} isPromise=${res instanceof Promise} value=${String(res)} ⇒ ${typeof res === "boolean" && res === false ? "PASS (sync false on async guard)" : "FAIL"}`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q5
  {
    const r = fresh();
    await r.start("/users");
    const cur = r.getState()?.name ?? "?";
    const can = r.canNavigateTo(cur);
    let nav: string;
    try {
      await r.navigate(cur);
      nav = "resolved";
    } catch (e) {
      nav = `rejected:${code(e)}`;
    }
    console.log(
      `Q5  SAME_STATE        : current=${cur} canNavigateTo=${can} navigate=${nav} ⇒ ${can === true && nav.startsWith("rejected") ? "DIVERGENCE (can=true, nav=SAME_STATES) — semantic, see report" : "note"}`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q6
  {
    const r = fresh();
    let sigCan = "unset";
    getLifecycleApi(r).addActivateGuard("admin", () => (_t, _f, signal) => {
      sigCan = signal === undefined ? "undefined" : (signal.constructor?.name ?? typeof signal);
      return true;
    });
    await r.start("/home");
    r.canNavigateTo("admin");

    const r2 = fresh();
    let sigNav = "unset";
    getLifecycleApi(r2).addActivateGuard("admin", () => (_t, _f, signal) => {
      sigNav = signal === undefined ? "undefined" : (signal.constructor?.name ?? typeof signal);
      return true;
    });
    await r2.start("/home");
    await r2.navigate("admin");
    console.log(
      `Q6  SIGNAL            : canNavigateTo guard signal=${sigCan} | navigate guard signal=${sigNav}`,
    );
    r.stop();
    r2.stop();
  }

  // -------------------------------------------------------------- Q7
  {
    const rp = fresh();
    getLifecycleApi(rp).addActivateGuard("admin", () => () => true);
    await rp.start("/home");
    const canP = rp.canNavigateTo("admin");
    let navP: boolean;
    try {
      await rp.navigate("admin");
      navP = true;
    } catch {
      navP = false;
    }

    const rb = fresh();
    getLifecycleApi(rb).addActivateGuard("admin", () => () => false);
    await rb.start("/home");
    const canB = rb.canNavigateTo("admin");
    let navB: boolean;
    try {
      await rb.navigate("admin");
      navB = true;
    } catch {
      navB = false;
    }
    console.log(
      `Q7  PARITY pass       : can=${canP} nav=${navP} ⇒ ${canP === navP ? "MATCH" : "DRIFT"}`,
    );
    console.log(
      `Q7  PARITY block      : can=${canB} nav=${navB} ⇒ ${canB === navB ? "MATCH" : "DRIFT"}`,
    );
    rp.stop();
    rb.stop();
  }

  // -------------------------------------------------------------- Q8
  {
    const r = fresh();
    getLifecycleApi(r).addDeactivateGuard("users", () => () => false);
    await r.start("/users");
    const can = r.canNavigateTo("home");
    console.log(
      `Q8  DEACTIVATE_PARITY : leaving users (deactivate=false) canNavigateTo(home)=${can} ⇒ ${can === false ? "PASS (deactivate honored)" : "FAIL"}`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q9 bounded
  {
    const r = fresh();
    let depth = 0;
    let maxDepth = 0;
    getLifecycleApi(r).addActivateGuard("admin", () => () => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      if (depth < 4) r.canNavigateTo("admin");
      depth--;
      return true;
    });
    await r.start("/home");
    const val = r.canNavigateTo("admin");
    console.log(
      `Q9  REENTRANCY bound  : maxDepth=${maxDepth} val=${String(val)} ⇒ recursion runs the same guard (no internal depth gate)`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q9 unbounded
  {
    const r = fresh();
    getLifecycleApi(r).addActivateGuard("admin", () => () => r.canNavigateTo("admin"));
    await r.start("/home");
    let q9b: string;
    try {
      q9b = `result=${String(r.canNavigateTo("admin"))}`;
    } catch (e) {
      q9b = `threw:${(e as any)?.constructor?.name ?? "?"}`;
    }
    console.log(
      `Q9  REENTRANCY unbound: ${q9b} (unbounded self-recursion — RangeError swallowed by #checkGuardSync ⇒ false, or surfaced)`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q10
  {
    const r = fresh();
    await r.start("/home");
    r.dispose();
    let q10: string;
    try {
      r.canNavigateTo("admin");
      q10 = "no-throw (FAIL)";
    } catch (e) {
      q10 = `threw:${code(e)}`;
    }
    console.log(
      `Q10 DISPOSE           : ${q10} ⇒ ${q10.includes("DISPOSED") ? "PASS (errorCodes.ROUTER_DISPOSED='DISPOSED')" : "CHECK"}`,
    );
  }

  // -------------------------------------------------------------- Q11
  {
    const r = fresh();
    let q11: string;
    try {
      q11 = `result=${String(r.canNavigateTo("admin"))}`;
    } catch (e) {
      q11 = `threw:${code(e)}`;
    }
    console.log(
      `Q11 BEFORE_START      : ${q11} ⇒ no FSM gate (fromState=undefined, full activation path)`,
    );
    r.stop();
  }

  // -------------------------------------------------------------- Q12
  {
    const r = fresh();
    let keysCan: string[] = [];
    let keysNav: string[] = [];
    getLifecycleApi(r).addActivateGuard("admin", () => (toState) => {
      keysCan = Object.keys(toState.params);
      return true;
    });
    await r.start("/home");
    r.canNavigateTo("admin", { x: undefined } as never);

    const r2 = fresh();
    getLifecycleApi(r2).addActivateGuard("admin", () => (toState) => {
      keysNav = Object.keys(toState.params);
      return true;
    });
    await r2.start("/home");
    await r2.navigate("admin", { x: undefined } as never);
    console.log(
      `Q12 UNDEFINED_PARAM   : canNavigateTo toState.params keys=[${keysCan}] | navigate keys=[${keysNav}] ⇒ ${JSON.stringify(keysCan) === JSON.stringify(keysNav) ? "MATCH" : "DRIFT (canNavigateTo skips normalizeParams undefined-strip)"}`,
    );
    r.stop();
    r2.stop();
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});

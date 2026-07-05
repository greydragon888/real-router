/**
 * Probe 02: PARITY sweep — canNavigateTo verdict vs real navigate outcome.
 *
 * The central invariant of canNavigateTo: for pure sync guards, it returns
 * `true` ⇔ `navigate(...)` resolves (excluding the SAME_STATES no-op, which is
 * not a guard rejection). This sweep runs each (transition × guard-config) on
 * TWIN routers — one queried read-only via canNavigateTo, one committed via
 * navigate — and compares. Specifically targets the meta-absence concern:
 * canNavigateTo builds toState WITHOUT meta (StateNamespace.makeState 2-arg),
 * navigate WITH meta — so getTransitionPath could in theory diverge on
 * param-only nested changes.
 *
 * Prints only DRIFT rows + a summary count. Zero drift ⇒ parity confirmed.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Params, Route, Router } from "@real-router/core";

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

type GuardCfg =
  | { kind: "none" }
  | { kind: "activate"; route: string; val: boolean }
  | { kind: "deactivate"; route: string; val: boolean };

interface Scenario {
  fromPath: string;
  toName: string;
  toParams: Params;
  label: string;
}

const SCENARIOS: Scenario[] = [
  { fromPath: "/home", toName: "users.view", toParams: { id: "1" }, label: "home→users.view" },
  { fromPath: "/home", toName: "admin.settings", toParams: {}, label: "home→admin.settings" },
  { fromPath: "/users/1", toName: "users.view", toParams: { id: "2" }, label: "users.view{1}→users.view{2} (param-only, meta-sensitive)" },
  { fromPath: "/users/1", toName: "users.list", toParams: {}, label: "users.view→users.list (sibling)" },
  { fromPath: "/admin", toName: "users.view", toParams: { id: "5" }, label: "admin.dashboard→users.view" },
  { fromPath: "/users/1", toName: "admin.settings", toParams: {}, label: "users.view→admin.settings (cross-tree)" },
];

const GUARDS: GuardCfg[] = [
  { kind: "none" },
  { kind: "activate", route: "users.view", val: false },
  { kind: "activate", route: "users", val: false },
  { kind: "activate", route: "admin.settings", val: false },
  { kind: "activate", route: "admin", val: false },
  { kind: "activate", route: "users.list", val: false },
  { kind: "deactivate", route: "users.view", val: false },
  { kind: "deactivate", route: "users", val: false },
  { kind: "deactivate", route: "admin", val: false },
  { kind: "activate", route: "users.view", val: true },
  { kind: "deactivate", route: "users", val: true },
];

function applyGuard(r: Router, g: GuardCfg): void {
  const lc = getLifecycleApi(r);
  if (g.kind === "activate") lc.addActivateGuard(g.route, () => () => g.val);
  if (g.kind === "deactivate") lc.addDeactivateGuard(g.route, () => () => g.val);
}

async function main(): Promise<void> {
  let total = 0;
  let drift = 0;
  let skippedSameState = 0;

  for (const s of SCENARIOS) {
    for (const g of GUARDS) {
      // Start CLEAN (no guards) so the from-state is always established, then
      // apply the guard so it governs only the transition under test — mirrors
      // navigate's pipeline (start commits, then guards gate the next nav).
      const a = createRouter(makeRoutes());
      await a.start(s.fromPath);
      applyGuard(a, g);

      const b = createRouter(makeRoutes());
      await b.start(s.fromPath);
      applyGuard(b, g);

      const fromName = a.getState()?.name;

      // Skip the SAME_STATES no-op — navigate rejects, canNavigateTo returns
      // true by design (not a guard rejection).
      const sameState = fromName === s.toName && JSON.stringify(a.getState()?.params ?? {}) === JSON.stringify(s.toParams);
      if (sameState) {
        skippedSameState++;
        a.stop();
        b.stop();
        continue;
      }

      const can = a.canNavigateTo(s.toName, s.toParams);
      let nav: boolean;
      try {
        await b.navigate(s.toName, s.toParams);
        nav = true;
      } catch {
        nav = false;
      }

      total++;
      if (can !== nav) {
        drift++;
        console.log(
          `DRIFT  ${s.label} | guard=${JSON.stringify(g)} | canNavigateTo=${can} navigate=${nav}`,
        );
      }

      a.stop();
      b.stop();
    }
  }

  console.log(
    `\nPARITY SWEEP: ${total} comparisons, ${drift} drift, ${skippedSameState} same-state skipped ⇒ ${drift === 0 ? "PARITY CONFIRMED (sync guards, ex-same-state)" : "DRIFT DETECTED — investigate"}`,
  );
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});

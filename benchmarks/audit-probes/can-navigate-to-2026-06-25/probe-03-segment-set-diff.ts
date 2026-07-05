/**
 * Probe 03: WHY canNavigateTo runs a guard navigate skips (drift root-cause).
 *
 * From probe-02: for users.view{1}→users.view{2} (param-only) and
 * users.view→users.list (sibling), a guard on the COMMON ANCESTOR `users`
 * blocks canNavigateTo but NOT navigate. Hypothesis: canNavigateTo builds
 * toState WITHOUT route meta (makeState 2-arg), so getTransitionPath computes a
 * different (larger) segment set than navigate (whose toState has meta).
 *
 * Instrument: put a recording guard (returns true) on EVERY segment, then
 * record which activate/deactivate guards each path actually invokes. The
 * segment-set difference is the bug, printed directly.
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
  ];
}

const ALL_SEGMENTS = ["home", "users", "users.list", "users.view"];

function instrument(r: Router, actLog: string[], deactLog: string[]): void {
  const lc = getLifecycleApi(r);
  for (const seg of ALL_SEGMENTS) {
    lc.addActivateGuard(seg, () => () => {
      actLog.push(seg);
      return true;
    });
    lc.addDeactivateGuard(seg, () => () => {
      deactLog.push(seg);
      return true;
    });
  }
}

async function compare(fromPath: string, toName: string, toParams: Params, label: string): Promise<void> {
  // canNavigateTo twin
  const a = createRouter(makeRoutes());
  await a.start(fromPath);
  const aAct: string[] = [];
  const aDeact: string[] = [];
  instrument(a, aAct, aDeact);
  a.canNavigateTo(toName, toParams);

  // navigate twin
  const b = createRouter(makeRoutes());
  await b.start(fromPath);
  const bAct: string[] = [];
  const bDeact: string[] = [];
  instrument(b, bAct, bDeact);
  await b.navigate(toName, toParams);

  console.log(`\n=== ${label} ===`);
  console.log(`  canNavigateTo  deactivate=[${aDeact}] activate=[${aAct}]`);
  console.log(`  navigate       deactivate=[${bDeact}] activate=[${bAct}]`);
  const same =
    JSON.stringify(aDeact) === JSON.stringify(bDeact) &&
    JSON.stringify(aAct) === JSON.stringify(bAct);
  console.log(`  ⇒ ${same ? "SAME segment set" : "DIFFERENT segment set — canNavigateTo over-evaluates"}`);

  a.stop();
  b.stop();
}

async function main(): Promise<void> {
  await compare("/users/1", "users.view", { id: "2" }, "users.view{1}→users.view{2} (param-only)");
  await compare("/users/1", "users.list", {}, "users.view→users.list (sibling)");
  await compare("/home", "users.view", { id: "7" }, "home→users.view (control: full activation)");
  await compare("/users/1", "home", {}, "users.view→home (control: full deactivation)");
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});

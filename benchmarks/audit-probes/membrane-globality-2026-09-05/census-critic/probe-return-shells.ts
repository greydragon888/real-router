// Census-critic probe 6: State-shell RETURNS the census does not list —
// PluginApi/RouterInternals.makeState·return, matchPath·return,
// buildNavigationState·return, and the committed shells Router.getState·return
// / getPreviousState·return (only their `.context` axis is listed).
// For each: frozen at the levels core owns? bags copied (not the caller's)?
// retained by core across calls (identity)? `.context` fresh and mutable?
//
// Positive control: port().resolveForward·return (listed as a pass-through
// shell) — the caller's bags by identity, unfrozen shell.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-return-shells.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

interface ShellReport {
  shellFrozen: boolean;
  paramsIsCallersBag: boolean | "n/a";
  paramsFrozen: boolean;
  searchFrozen: boolean;
  contextFrozen: boolean;
  contextFreshPerCall: boolean;
  shellSameAcrossCalls: boolean;
  paramsSameAcrossCalls: boolean;
  searchSameAcrossCalls: boolean;
}

function report(
  a: { params: object; search: object; context: object },
  b: { params: object; search: object; context: object },
  callersBag: object | undefined,
): ShellReport {
  return {
    shellFrozen: Object.isFrozen(a),
    paramsIsCallersBag: callersBag === undefined ? "n/a" : a.params === callersBag,
    paramsFrozen: Object.isFrozen(a.params),
    searchFrozen: Object.isFrozen(a.search),
    contextFrozen: Object.isFrozen(a.context),
    contextFreshPerCall: a.context !== b.context,
    shellSameAcrossCalls: a === b,
    paramsSameAcrossCalls: a.params === b.params,
    searchSameAcrossCalls: a.search === b.search,
  };
}

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const ctx = getInternals(router);

  await router.start("/home");

  const bag = { id: "1" };
  const sbag = { tab: "x" };

  const m1 = api.makeState("u", bag, sbag);
  const m2 = api.makeState("u", bag, sbag);
  const mp1 = api.matchPath("/u/1?tab=x")!;
  const mp2 = api.matchPath("/u/1?tab=x")!;
  const bn1 = api.buildNavigationState("u", bag, sbag)!;
  const bn2 = api.buildNavigationState("u", bag, sbag)!;
  const im1 = ctx.makeState("u", bag, sbag);
  const im2 = ctx.makeState("u", bag, sbag);
  const imp1 = ctx.matchPath("/u/1?tab=x", ctx.getOptions())!;
  const imp2 = ctx.matchPath("/u/1?tab=x", ctx.getOptions())!;

  await router.navigate("u", { id: "2" }, { tab: "y" });

  const g1 = router.getState()!;
  const g2 = router.getState()!;
  const pv1 = router.getPreviousState()!;
  const pv2 = router.getPreviousState()!;

  const fwd1 = ctx.port().resolveForward("u", bag, sbag);
  const fwd2 = ctx.port().resolveForward("u", bag, sbag);

  console.log(
    JSON.stringify(
      {
        "PluginApi.makeState·return": report(m1, m2, bag),
        "PluginApi.matchPath·return": report(mp1, mp2, undefined),
        "PluginApi.buildNavigationState·return": report(bn1, bn2, bag),
        "RouterInternals.makeState·return": report(im1, im2, bag),
        "RouterInternals.matchPath·return": report(imp1, imp2, undefined),
        "Router.getState·return": report(g1, g2, undefined),
        "Router.getPreviousState·return": report(pv1, pv2, undefined),
        "control_port().resolveForward·return (listed pass-through)": {
          shellFrozen: Object.isFrozen(fwd1),
          paramsIsCallersBag: fwd1.params === bag,
          searchIsCallersBag: fwd1.search === sbag,
          shellSameAcrossCalls: fwd1 === fwd2,
        },
      },
      null,
      2,
    ),
  );
}

void main();

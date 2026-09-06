// L1-construction · cloneRouter(router, dependencies?, opts?) under a full-trap Proxy.
//
// Two questions:
//   (1) the clone's OWN doors — the override `dependencies` bag, `opts`, `opts.logger`:
//       which traps fire, and does anything read them after the clone is built?
//   (2) the BASE's caller-owned containers — options.queryParams / options.limits /
//       options.defaultParams / route.defaultParams / route objects: which of them
//       does building a clone read AGAIN (a second read per request under SSR)?
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { censused, compact, show, writes } from "./census";

import type { Census } from "./census";

async function main(): Promise<void> {
const baseSvc = { name: "base" };
const reqSvc = { name: "request" };

// Base router's caller-owned containers.
const routeDefaultParams = censused({ x: "1" });
const routeObject = censused({ name: "u", path: "/u/:id?tab", defaultParams: routeDefaultParams.proxy });
const optQueryParams = censused({ arrayFormat: "brackets" });
const optLimits = censused({ maxListeners: 5 });
const optDefaultParams = censused({ id: "9" });
const optLogger = censused({ level: "error-only" });
const optionsBag = censused({
  defaultRoute: "u",
  defaultParams: optDefaultParams.proxy,
  queryParams: optQueryParams.proxy,
  limits: optLimits.proxy,
  logger: optLogger.proxy,
});
const baseDeps = censused({ baseSvc });

const base = createRouter(
  [routeObject.proxy, { name: "home", path: "/home" }] as never,
  optionsBag.proxy as never,
  baseDeps.proxy as never,
);

// Clone's own doors.
const overrideDeps = censused({ reqSvc });
const cloneLogger = censused({ callback: () => {} });
const cloneOpts = censused({ logger: cloneLogger.proxy });

const doors: Record<string, ReturnType<typeof censused>> = {
  "BASE options (bag)": optionsBag,
  "BASE options.queryParams": optQueryParams,
  "BASE options.limits": optLimits,
  "BASE options.defaultParams": optDefaultParams,
  "BASE options.logger": optLogger,
  "BASE dependencies (bag)": baseDeps,
  "BASE routes[0] (route object)": routeObject,
  "BASE routes[0].defaultParams": routeDefaultParams,
  "CLONE dependencies (override bag)": overrideDeps,
  "CLONE opts": cloneOpts,
  "CLONE opts.logger": cloneLogger,
};

const snapAll = (): Record<string, Census> =>
  Object.fromEntries(Object.entries(doors).map(([k, d]) => [k, d.snap()]));

const report = (phase: string, since: Record<string, Census>): void => {
  console.log(`\n== ${phase} ==`);

  for (const [label, door] of Object.entries(doors)) {
    const d = door.delta(since[label]);

    show(`  ${label}:`, compact(d));

    if (writes(d) !== 0) {
      show(`  !! WRITE into caller container ${label}:`, compact(d));
    }
  }
};

const beforeClone = snapAll();
const clone = cloneRouter(base, overrideDeps.proxy as never, cloneOpts.proxy as never);

report("cloneRouter(base, overrideDeps, opts)", beforeClone);

// Positive controls.
show("\ncontrol · clone.get('reqSvc') === reqSvc:", getDependenciesApi(clone).get("reqSvc" as never) === reqSvc);
show("control · clone.get('baseSvc') === baseSvc (shared leaf):", getDependenciesApi(clone).get("baseSvc" as never) === baseSvc);
show("control · clone.buildPath('u',{id:'1'},{l:['a','b']}) (arrayFormat inherited by RE-READ of caller bag):",
  clone.buildPath("u", { id: "1" }, { l: ["a", "b"] } as never));

const cloneOptions = getPluginApi(clone).getOptions();

show("control · clone.getOptions().queryParams === base caller bag:", cloneOptions.queryParams === optQueryParams.proxy);
show("control · clone.getOptions().defaultParams === base caller bag:", cloneOptions.defaultParams === optDefaultParams.proxy);
show("control · clone.getOptions().limits (resolved numbers, not caller bag):", (cloneOptions as Record<string, unknown>).limits);
show("control · clone.getOptions().limits === base caller bag:", (cloneOptions as Record<string, unknown>).limits === optLimits.proxy);

const cloneStore = getInternals(clone).routeGetStore();
const baseStore = getInternals(base).routeGetStore();

show("control · clone config.defaultParams.u === base caller bag (shared by reference):", cloneStore.config.defaultParams.u === routeDefaultParams.proxy);
show("control · clone config.defaultParams !== base config.defaultParams (map copied):", cloneStore.config.defaultParams !== baseStore.config.defaultParams);
show("control · getCloneState().dependencies is a fresh object each call:", getInternals(base).getCloneState().dependencies !== getInternals(base).getCloneState().dependencies);
show("control · getCloneState().limitKeys frozen:", Object.isFrozen(getInternals(base).getCloneState().limitKeys));

let capped = 0;

try {
  for (let i = 0; i < 10; i += 1) {
    clone.subscribe(() => {});
  }
} catch {
  capped = 1;
}

show("control · clone inherited maxListeners=5 (1 = threw under 10 subscribes):", capped);

// Post-clone: does anything read the clone's own doors again?
const afterClone = snapAll();

await clone.start("/home");
await clone.navigate("u", { id: "3" });
clone.dispose();
report("post-clone · start + navigate + dispose on the clone", afterClone);

base.dispose();
}

void main();

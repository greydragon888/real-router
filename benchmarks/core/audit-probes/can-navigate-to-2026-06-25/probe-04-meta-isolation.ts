/**
 * Probe 04: isolate route-meta as the cause of the canNavigateTo path bug.
 *
 * computeTransitionPath has a "FAST PATH 3: both states meta-less" branch that
 * returns nameToIDs(to) / nameToIDs(from) for the WHOLE name — no common-ancestor
 * detection. It fires only when BOTH toState and fromState lack meta.
 *
 *  - navigate's toState is built WITH meta (buildNavigateState → makeState 5-arg)
 *    ⇒ STANDARD PATH ⇒ correct common-ancestor trimming.
 *  - canNavigateTo's toState is built WITHOUT meta (Router.ts makeState 2-arg)
 *    ⇒ if the committed fromState is ALSO meta-less, FAST PATH 3 fires ⇒ the
 *    whole chain is (de)activated, including the shared ancestor.
 *
 * Confirms: (1) the committed getState() carries no meta; (2) attaching meta to
 * the toState flips the computed path from over-broad to correct.
 */

import { createRouter } from "@real-router/core";

import { getTransitionPath } from "../../../../packages/core/src/transitionPath";
import {
  getStateMetaParams,
  setStateMetaParams,
} from "../../../../packages/core/src/stateMetaStore";

import type { State } from "@real-router/core";

function makeRoutes() {
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

async function main(): Promise<void> {
  const r = createRouter(makeRoutes());
  await r.start("/users/1");
  await r.navigate("users.view", { id: "1" }).catch(() => undefined); // ensure committed users.view{1}
  const committed = r.getState() as State;

  console.log(`committed state name=${committed.name} params=${JSON.stringify(committed.params)}`);
  console.log(
    `(1) committed getState() meta present? ${getStateMetaParams(committed) !== undefined} ⇒ ${getStateMetaParams(committed) === undefined ? "NO META on committed fromState — fast-path-3 enabled for meta-less toState" : "has meta"}`,
  );

  // toState as canNavigateTo builds it: NO meta
  const toNoMeta: State = {
    name: "users.view",
    params: { id: "2" },
    path: "/users/2",
    context: {},
    transition: committed.transition,
  };

  // toState as navigate builds it: WITH meta (param id belongs to users.view)
  const toWithMeta: State = {
    name: "users.view",
    params: { id: "2" },
    path: "/users/2",
    context: {},
    transition: committed.transition,
  };
  setStateMetaParams(toWithMeta, { "users.view": { id: "url" } } as never);

  const pNoMeta = getTransitionPath(toNoMeta, committed);
  const pWithMeta = getTransitionPath(toWithMeta, committed);

  console.log(
    `(2a) canNavigateTo-shape (no meta): toDeactivate=[${pNoMeta.toDeactivate}] toActivate=[${pNoMeta.toActivate}] intersection="${pNoMeta.intersection}"`,
  );
  console.log(
    `(2b) navigate-shape   (with meta): toDeactivate=[${pWithMeta.toDeactivate}] toActivate=[${pWithMeta.toActivate}] intersection="${pWithMeta.intersection}"`,
  );
  console.log(
    `⇒ ${JSON.stringify(pNoMeta.toActivate) !== JSON.stringify(pWithMeta.toActivate) ? "ROOT CAUSE CONFIRMED — meta presence flips the path; canNavigateTo over-evaluates the shared ancestor" : "no difference"}`,
  );

  r.stop();
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});

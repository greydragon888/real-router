/**
 * Probe 02: add() during an in-flight ASYNC navigation.
 *
 * `add` has NO `ctx.isTransitioning()` race-guard (getRoutesApi.ts:425-445),
 * unlike remove (validateRemoveRoute), clear/replace (validateClearRoutes) and
 * update (logs error). Question: does adding a route mid-async-navigation
 * corrupt the in-flight navigation's resolved target?
 *
 * Verdict printed: whether the in-flight nav still resolves to its original
 * target, and whether the newly-added route is available afterward.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "target", path: "/target" },
  ]);
  const routesApi = getRoutesApi(router);
  const lifecycle = getLifecycleApi(router);

  let resolveGuard!: (v: boolean) => void;
  let reached!: () => void;
  const guardReached = new Promise<void>((r) => (reached = r));

  lifecycle.addActivateGuard(
    "target",
    () => () =>
      new Promise<boolean>((resolve) => {
        resolveGuard = resolve;
        reached();
      }),
  );

  await router.start("/");

  const navPromise = router.navigate("target");
  await guardReached;

  // add() mid-navigation (no race-guard blocks this)
  let addThrew = false;
  try {
    routesApi.add({ name: "injected", path: "/injected" });
  } catch {
    addThrew = true;
  }

  resolveGuard(true);
  const finalState = await navPromise;

  console.log("add() threw during nav      :", addThrew);
  console.log("in-flight nav resolved to   :", finalState.name);
  console.log("nav target intact           :", finalState.name === "target");
  console.log("injected route available    :", routesApi.has("injected"));
}

void main();

// Triage probe (batch: thenable-returns). The existing census-completeness
// probe measured onStart / onTransitionStart / onTransitionLeaveApprove /
// onTransitionSuccess / PluginApi.addEventListener / subscribe. The three rows
// left WITHOUT a named measurement are covered here:
//   Plugin.onTransitionError·return
//   Plugin.onTransitionCancel·return
//   RouterInternals.addEventListener·cb·return
// Counted per site: reads of `.then` on the caller's returned object and calls
// of that `.then` by core (EventEmitter · #invokeIsolated).
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

const counters: Record<string, { thenReads: number; thenCalls: number }> = {};

const thenable = (site: string): unknown => {
  counters[site] ??= { thenReads: 0, thenCalls: 0 };

  return {
    get then() {
      counters[site].thenReads++;

      return (resolve: (v: unknown) => void) => {
        counters[site].thenCalls++;
        resolve(undefined);
      };
    },
  };
};

async function main(): Promise<void> {
  const routes = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
    { name: "c", path: "/c" },
  ];
  const router = createRouter(routes as never, {} as never);

  router.usePlugin(
    (() => ({
      onTransitionError: () => thenable("Plugin.onTransitionError·return"),
      onTransitionCancel: () => thenable("Plugin.onTransitionCancel·return"),
    })) as never,
  );

  // RouterInternals.addEventListener — the subpath twin of the PluginApi door.
  getInternals(router).addEventListener("$$success", (() =>
    thenable("RouterInternals.addEventListener·cb·return")) as never);

  await router.start("/a");

  // ERROR arm: a guard that rejects the transition.
  router.usePlugin(
    (() => ({
      onTransitionStart: () => undefined,
    })) as never,
  );

  try {
    await router.navigate("nope" as never);
  } catch {
    /* expected */
  }

  // CANCEL arm: a slow guard holds the first navigation open while a second
  // starts, so the first is cancelled (TRANSITION_CANCEL).
  getLifecycleApi(router).addActivateGuard("b", ((): (() => Promise<boolean>) =>
    () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 50);
      })) as never);

  const first = router.navigate("b").catch(() => undefined);

  await new Promise((r) => setTimeout(r, 5));

  const second = router.navigate("c").catch(() => undefined);

  await Promise.all([first, second]);
  await new Promise((r) => setTimeout(r, 80));

  // NEGATIVE CONTROL: a returned object WITHOUT a callable `then` is read once
  // and left alone (no `then` call, no Promise.resolve adoption).
  counters.plainControl = { thenReads: 0, thenCalls: 0 };
  getInternals(router).addEventListener("$$success", (() => ({
    get then() {
      counters.plainControl.thenReads++;

      return 42;
    },
  })) as never);
  await router.navigate("a");
  await new Promise((r) => setTimeout(r, 20));

  console.log(JSON.stringify(counters, null, 1));
}

void main();

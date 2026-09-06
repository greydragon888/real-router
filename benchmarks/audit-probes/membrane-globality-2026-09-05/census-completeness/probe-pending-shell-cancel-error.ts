// Census-completeness probe: the PENDING State shell (plan.toState) handed out
// on the CANCEL and ERROR arcs — `onTransitionCancel` / `onTransitionError` /
// `$$cancel` / `$$error` — is it the same unfrozen object `onTransitionStart`
// received, and does the SAME_STATES refusal hand out a never-announced shell?
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

let releaseGuard: (v: boolean) => void = () => {};

const routes = [
  { name: "a", path: "/a" },
  {
    name: "b",
    path: "/b",
    canActivate: () => () =>
      new Promise<boolean>((resolve) => {
        releaseGuard = resolve;
      }),
  },
  { name: "c", path: "/c" },
  { name: "d", path: "/d", canActivate: () => () => false },
];

const seen: Record<string, unknown> = {};
const describe = (s: unknown) =>
  s === undefined
    ? "undefined"
    : {
        name: (s as { name: string }).name,
        frozenShell: Object.isFrozen(s),
        frozenParams: Object.isFrozen((s as { params: object }).params),
        frozenContext: Object.isFrozen((s as { context: object }).context),
      };

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const api = getPluginApi(router);
  let startedB: unknown;
  let startedD: unknown;

  router.usePlugin(() => ({
    onTransitionStart: (to: { name: string }) => {
      if (to.name === "b") startedB = to;
      if (to.name === "d") startedD = to;
    },
    onTransitionCancel: (to: unknown) => {
      seen.onTransitionCancel_toState = describe(to);
      seen.onTransitionCancel_isStartedShell = to === startedB;
      // writes land on the unfrozen shell
      (to as { context: Record<string, unknown> }).context.probe = 1;
      (to as Record<string, unknown>).extraKey = 1;
      seen.onTransitionCancel_writesLanded =
        (to as { context: Record<string, unknown> }).context.probe === 1 &&
        (to as Record<string, unknown>).extraKey === 1;
    },
    onTransitionError: (to: unknown, _from: unknown, err: { code?: string }) => {
      seen[`onTransitionError_${err?.code ?? "?"}_toState`] = describe(to);
      if (err?.code === "CANNOT_ACTIVATE") {
        seen.onTransitionError_isStartedShell = to === startedD;
      }
    },
  }));
  api.addEventListener("$$cancel", (to: unknown) => {
    seen.$$cancel_sameAsHook = to === startedB;
  });
  api.addEventListener("$$error", (to: unknown, _f: unknown, err: { code?: string }) => {
    if (err?.code === "CANNOT_ACTIVATE") seen.$$error_sameAsHook = to === startedD;
  });

  await router.start("/a");

  // CANCEL arc: b's guard is parked; navigating to c supersedes it.
  const pB = router.navigate("b").catch((e: { code: string }) => e.code);
  const pC = router.navigate("c").catch((e: { code: string }) => e.code);
  seen.cancelOutcome = await pB;
  await pC;
  releaseGuard(true);

  // ERROR arc: d's guard refuses.
  seen.errorOutcome = await router.navigate("d").catch((e: { code: string }) => e.code);

  // SAME_STATES arm: never announced, still handed out.
  seen.sameStatesOutcome = await router.navigate("c").catch((e: { code: string }) => e.code);

  // POSITIVE CONTROL: the committed state is frozen.
  seen.committed = describe(router.getState());

  console.log(JSON.stringify(seen, null, 1));
}

void main();

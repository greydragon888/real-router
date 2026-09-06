// OBSERVERS arm of the family «RouterError · application objects on a core error».
//
// The MUST-(б) criterion says: a door is MUST-(б) when the object is handed BACK
// to the application, which is then entitled to the SAME reference. The census
// names two observers for this family — `PluginApi.emitTransitionError·error`
// and `RouterInternals.emitTransitionError·error`. This probe walks the public
// path to both: an application error thrown from a guard, observed through
// `Plugin.onTransitionError`, through the `navigate()` rejection, plus the same
// walk for a FOREIGN (non-RouterError) throw.
//
// Shapes read from source before writing:
//   types/router.ts · Plugin.onTransitionError(toState, fromState, err)
//   types/router.ts · usePlugin(...plugins: (PluginFactory<D> | false | ...)[])
//   RouterError.ts  · constructor(code, { message, segment, path, ...rest } = {})
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-routererror-объекты-приложения-на-ошибке-ядра/observers.ts
import { createRouter, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};
const rd = (o: object, k: string): unknown => (o as Record<string, unknown>)[k];

async function arc(
  label: string,
  make: () => unknown,
  leaves: Record<string, object>,
): Promise<void> {
  const thrown = make();
  const seenByPlugin: unknown[] = [];

  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "blocked", path: "/blocked" },
  ]);

  router.usePlugin(() => ({
    onTransitionError: (_to, _from, err) => {
      seenByPlugin.push(err);
    },
  }));

  getLifecycleApi(router).addActivateGuard("blocked", () => () => {
    throw thrown;
  });

  await router.start("/home");

  let rejected: unknown;

  try {
    await router.navigate("blocked");
  } catch (error) {
    rejected = error;
  }

  const observed = seenByPlugin[0] as RouterError | undefined;

  out[label] = {
    // POSITIVE CONTROL: the arc actually errored and the observer actually fired.
    pluginFired: seenByPlugin.length,
    rejectedIsRouterError: rejected instanceof RouterError,
    code: rejected instanceof RouterError ? rejected.code : null,
    // Identity — the MUST-(б) question.
    pluginSawTheAppsOwnObject: observed === thrown,
    rejectionIsTheAppsOwnObject: rejected === thrown,
    pluginAndRejectionSameObject: observed === rejected,
    // Do the app's LEAVES survive the crossing?
    leafIdentity: Object.fromEntries(
      Object.entries(leaves).map(([k, v]) => [
        k,
        observed ? rd(observed, k) === v : null,
      ]),
    ),
    // P4 at the handout: which level is frozen?
    observedFrozen: observed ? Object.isFrozen(observed) : null,
    appObjectFrozen: Object.isFrozen(thrown as object),
    leafFrozen: Object.fromEntries(
      Object.entries(leaves).map(([k, v]) => [k, Object.isFrozen(v)]),
    ),
    customFieldSurvived: observed ? rd(observed, "appField") : null,
  };

  router.dispose();
}

async function main(): Promise<void> {
  const leafA = { svc: "APP-LEAF-A" };
  const nestedA = { deep: { x: 1 } };

  await arc(
    "appRouterErrorThrownFromGuard",
    () =>
      new RouterError("APP_CODE", {
        message: "app said no",
        appField: "APP-VALUE",
        svc: leafA,
        ctx: nestedA,
      }),
    { svc: leafA, ctx: nestedA },
  );

  const leafB = { svc: "APP-LEAF-B" };
  const foreign = new Error("foreign boom");

  (foreign as { cause?: unknown }).cause = leafB;
  (foreign as Record<string, unknown>).appField = "APP-VALUE";
  (foreign as Record<string, unknown>).svc = leafB;

  await arc("foreignErrorThrownFromGuard", () => foreign, { svc: leafB });

  console.log(JSON.stringify(out, null, 1));
}

void main();

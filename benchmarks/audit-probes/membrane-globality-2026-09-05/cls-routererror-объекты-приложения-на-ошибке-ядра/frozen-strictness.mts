// P4 satellite. Under the CJS transform `tsx` applies to a `.ts` probe,
// `putField`'s `target[key] = value` runs SLOPPY (it is a plain module
// function), so a write to a frozen thrown error is silently dropped, while
// `setErrorInstance` — a CLASS method, always strict — throws. This file is
// `.mts`, so the whole graph loads as real ESM (strict everywhere), which is
// what ships. Positive control: the same two calls on a NON-frozen error.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-routererror-объекты-приложения-на-ошибке-ядра/frozen-strictness.mts
import { createRouter, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const attempt = (run: () => void): string => {
  try {
    run();

    return "no throw";
  } catch (error) {
    return String(error);
  }
};

const router = createRouter([
  { name: "home", path: "/home" },
  { name: "blocked", path: "/blocked" },
]);

getLifecycleApi(router).addActivateGuard("blocked", () => () => {
  throw new RouterError("APP_THROWN", { ctx: { deep: 1 } });
});

await router.start("/home");

let received: RouterError | undefined;

try {
  await router.navigate("blocked");
} catch (error) {
  received = error as RouterError;
}

const frozen = received as RouterError;

// POSITIVE CONTROL: a non-frozen error takes both calls.
const open = new RouterError("OPEN");
const control = {
  setAdditionalFields: attempt(() => {
    open.setAdditionalFields({ note: "ok" });
  }),
  landed: Object.hasOwn(open, "note"),
  setErrorInstance: attempt(() => {
    open.setErrorInstance(new Error("e"));
  }),
  messageChanged: open.message === "e",
};

console.log(
  JSON.stringify(
    {
      esm: import.meta.url.endsWith(".mts"),
      control,
      frozenIsFrozen: Object.isFrozen(frozen),
      frozenSetAdditionalFields: attempt(() => {
        frozen.setAdditionalFields({ note: "late" });
      }),
      frozenNoteLanded: Object.hasOwn(frozen, "note"),
      frozenSetErrorInstance: attempt(() => {
        frozen.setErrorInstance(new Error("late"));
      }),
      frozenCtxStillCallersObject: typeof (frozen as unknown as {
        ctx: unknown;
      }).ctx,
      frozenCtxFrozen: Object.isFrozen(
        (frozen as unknown as { ctx: object }).ctx,
      ),
    },
    null,
    1,
  ),
);

router.dispose();

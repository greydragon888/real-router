// Probe-07b: sendFailSafe via guard throw (errorHandling.ts path).
//
// Guard throws → handleGuardError → sendFail via wireRouter binding.
// sendFailSafe is used in emitTransitionError binding (RouterWiringBuilder.ts:202).

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const arbErrors = [
  null,
  undefined,
  0,
  false,
  "",
  "string error",
  42,
  {},
  { code: "X" },
  new Error("real-error"),
  Symbol("sym"),
  [],
  { then: () => {} }, // thenable — caution: ensureError treats as Error?
];

for (let i = 0; i < arbErrors.length; i++) {
  const err = arbErrors[i];
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  const lifecycle = getLifecycleApi(router);
  lifecycle.addActivateGuard("a", () => () => {
    throw err;
  });

  let outerErr;
  try {
    await router.navigate("a");
  } catch (e) {
    outerErr = `${e?.code ?? "no-code"}:${e?.message ?? e?.toString() ?? "no-msg"}`;
  }
  console.log(
    `err[${i}] type=${typeof err} val=${typeof err === "symbol" ? "Symbol(...)" : String(err)} -> ${outerErr}`,
  );
  router.dispose();
}

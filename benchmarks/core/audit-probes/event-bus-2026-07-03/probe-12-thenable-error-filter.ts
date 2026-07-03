// probe-12: baseline leftover #6 closure check — a guard that throws a
// THENABLE object must not turn the resulting RouterError into a thenable
// (errorHandling.ts:92 now filters "then" via reservedRouterErrorProps).
// If the filter were missing, `await navigate().catch(e => e)` would treat the
// error as a promise and hang/unwrap instead of returning it.
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";

void (async () => {
  const r = createRouter([
    { name: "home", path: "/" },
    {
      name: "trap",
      path: "/trap",
      canActivate: () => () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- adversarial thenable
        throw {
          message: "thenable-trap",
          then(resolve: (v: unknown) => void) {
            resolve("hijacked");
          },
          marker: "custom-prop",
        };
      },
    },
  ]);

  await r.start("/");

  const err: unknown = await r.navigate("trap").then(
    () => "unexpectedly-resolved",
    (e: unknown) => e,
  );

  const isHijacked = err === "hijacked";
  const hasThen = typeof (err as { then?: unknown }).then === "function";
  const code = (err as { code?: string }).code;
  const marker = (err as { marker?: string }).marker;

  console.log(`caught: ${isHijacked ? "HIJACKED (await unwrapped the thenable!)" : "RouterError"} code=${String(code)} then-prop=${hasThen ? "PRESENT (leak)" : "filtered"} marker=${String(marker)} (non-reserved props still copied)`);
  console.log(`verdict: ${!isHijacked && !hasThen && code === "CANNOT_ACTIVATE" ? "#6 CLOSED — then filtered, error not thenable" : "#6 REGRESSION"}`);
})();

// Probe-07: sendFailSafe never-throws claim verification.
//
// sendFailSafe is invoked from error-handlers; if it throws, the original
// error is swallowed and a new one is raised. Verify with arbitrary
// "error"-shaped inputs.

import { createRouter } from "@real-router/core";

const router = createRouter([{ name: "home", path: "/" }]);
await router.start("/");

// Directly poking internal — we don't have public sendFailSafe access, so
// trigger it via wireRouter binding: forwardState that throws, or via
// emitTransitionError directly through internals. Public surface that
// indirectly exercises sendFailSafe = `forwardState` plugin interceptor
// that throws. Easier path: emit via `addEventListener` for a plugin that
// triggers sendFail via thrown error inside a guard pipeline (errorHandling.ts).

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
  { then: () => {} }, // thenable
];

// Alternate path: use `emitTransitionError` internal via plugin throwing in onTransitionStart
console.log("=== sendFailSafe via plugin throwing in onTransitionStart ===");
for (let i = 0; i < arbErrors.length; i++) {
  const err = arbErrors[i];
  const r = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await r.start("/");

  let listenerErr;
  let outerErr;
  r.usePlugin(() => ({
    onTransitionStart() {
      throw err;
    },
  }));

  // EventEmitter routes listener throws to onListenerError; sendFailSafe is
  // called by errorHandling.ts when forwardState rejects. Use forwardState
  // interceptor pattern instead — but that's plugin-only. Easier: rely on
  // the broader navigate pipeline + guard throw.

  // We'll just observe that the router does not crash during navigate:
  try {
    await r.navigate("a").catch((e) => {
      listenerErr = `${e?.code ?? e?.message ?? String(e)}`;
    });
  } catch (e) {
    outerErr = `${e?.code ?? e?.message ?? String(e)}`;
  }
  console.log(`  err[${i}] type=${typeof err} listenerErr=${listenerErr} outerErr=${outerErr}`);
  r.dispose();
}

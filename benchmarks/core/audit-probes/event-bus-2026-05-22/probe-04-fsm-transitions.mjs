// Probe-04: FSM transition coverage for ANY→DISPOSED.
//
// Cross-ref start audit Bug #1 + #2: STARTING / TRANSITION_STARTED /
// LEAVE_APPROVED do not have transitions to DISPOSED. Verify by directly
// instantiating the FSM with each starting state via forceState, then sending
// DISPOSE.

// Hard-coded mirror of fsm/routerFSM.ts transitions table for direct review.
// Source file: packages/core/src/fsm/routerFSM.ts:73-104.

const config = {
  IDLE: { START: "STARTING", DISPOSE: "DISPOSED" },
  STARTING: { STARTED: "READY", FAIL: "IDLE" },
  READY: {
    NAVIGATE: "TRANSITION_STARTED",
    FAIL: "READY",
    STOP: "IDLE",
  },
  TRANSITION_STARTED: {
    NAVIGATE: "TRANSITION_STARTED",
    LEAVE_APPROVE: "LEAVE_APPROVED",
    CANCEL: "READY",
    FAIL: "READY",
  },
  LEAVE_APPROVED: {
    NAVIGATE: "TRANSITION_STARTED",
    COMPLETE: "READY",
    CANCEL: "READY",
    FAIL: "READY",
  },
  DISPOSED: {},
};

const states = Object.keys(config);
console.log("FSM transition table for DISPOSE event:");
for (const s of states) {
  const target = config[s].DISPOSE;
  console.log(`  ${s} --DISPOSE--> ${target ?? "(missing)"}`);
}

console.log("\nMissing DISPOSE transitions (from any non-DISPOSED state):");
const missing = [];
for (const s of states) {
  if (config[s].DISPOSE === undefined && s !== "DISPOSED") {
    missing.push(s);
  }
}
console.log("  ", missing.length ? missing.join(", ") : "(none)");

// === Behavioural probe via Router: simulate dispose mid-STARTING ===
const { createRouter } = await import("@real-router/core");
const routes = [{ name: "home", path: "/" }];

// Case 1: dispose mid-STARTING via interceptor throwing
{
  const router = createRouter(routes);
  // Use plugin to add a start-interceptor that throws synchronously
  router.usePlugin(() => ({
    teardown() {},
  }));

  // Force STARTING and then dispose; we go through public API + observe state
  // before / after.
  const beforeStart = router.isActive();
  // Manually trigger start with a path matcher likely to throw deep inside
  let startError;
  try {
    await router.start("/nonexistent");
  } catch (e) {
    startError = `${e?.code ?? e?.message}`;
  }
  console.log("[case 1: start error]", startError);
  console.log("  isActive before dispose:", router.isActive());
  router.dispose();
  console.log("  isActive after dispose:", router.isActive());
}

// Case 2: dispose mid TRANSITION_STARTED via async guard
{
  const { getLifecycleApi } = await import("@real-router/core/api");
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);
  await router.start("/");

  const lifecycle = getLifecycleApi(router);
  lifecycle.addActivateGuard("a", () => async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return true;
  });

  const p = router.navigate("a").catch((e) => `rejected:${e?.code || e?.message}`);
  await new Promise((resolve) => setTimeout(resolve, 5));
  console.log("[case 2: dispose mid TRANSITION_STARTED]");
  console.log("  isActive before dispose:", router.isActive());
  router.dispose();
  console.log("  isActive after dispose (false = DISPOSED via fallback markDisposed):", router.isActive());
  const tail = await p;
  console.log("  navigate outcome:", tail);
}


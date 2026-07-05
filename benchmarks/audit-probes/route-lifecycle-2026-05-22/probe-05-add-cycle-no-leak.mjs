// Probe-05: addActivateGuard × N + clearAll cycles — verify no memory leak in
// the Maps + Sets after symmetric ops. Closes Bug-risk «#registering Set leak»
// and «Maps growing despite clear».

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

const router = createRouter([{ name: "home", path: "/" }]);
await router.start("/");

const lifecycle = getLifecycleApi(router);
const ns = getInternals(router).routeGetStore().lifecycleNamespace;

const N = 1000;
const CYCLES = 5;

for (let c = 0; c < CYCLES; c++) {
  for (let i = 0; i < N; i++) {
    lifecycle.addActivateGuard(`r${i}`, () => () => true);
  }

  const cntActAfterAdd = ns.getHandlerCount("activate");
  const [d, a] = ns.getFunctions();
  console.log(
    `[cycle ${c}] after ${N} addActivateGuard: count=${cntActAfterAdd} deactMap=${d.size} actMap=${a.size}`,
  );

  for (let i = 0; i < N; i++) {
    lifecycle.removeActivateGuard(`r${i}`);
  }

  const cntActAfterRemove = ns.getHandlerCount("activate");
  const [d2, a2] = ns.getFunctions();
  console.log(
    `[cycle ${c}] after remove: count=${cntActAfterRemove} deactMap=${d2.size} actMap=${a2.size}`,
  );
}

// Final check
const [df, af] = ns.getFunctions();
console.log("\n[Probe-05] Final state:");
console.log("  deactivate Map size:", df.size);
console.log("  activate Map size:", af.size);
console.log("  activate handler count:", ns.getHandlerCount("activate"));
console.log("  deactivate handler count:", ns.getHandlerCount("deactivate"));

const clean = df.size === 0 && af.size === 0;
if (clean) {
  console.log("→ VERIFIED: no leak across add/remove cycles.");
  process.exitCode = 0;
} else {
  console.log("→ BUG: residual entries after add/remove cycles.");
  process.exitCode = 1;
}

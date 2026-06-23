/**
 * Probe 03: VERIFY — Guard origin tracking lost in clone.
 *
 * Issue: cloneRouter.ts:52-58 iterates ALL factories (both definition and external)
 * and re-adds them via `lifecycle.addActivateGuard(name, handler)` (PUBLIC API).
 * The public API calls `addCanActivate(name, handler)` without `isFromDefinition=true`,
 * so it defaults to `false` (RouteLifecycleNamespace.ts:96).
 *
 * Consequence: even if a guard was originally a DEFINITION guard
 * (added via `route.canActivate` config), in the clone it's tracked as EXTERNAL.
 * Then `getRoutesApi(clone).replace(routes)` would NOT clear it (clearDefinitionGuards
 * only touches definition-origin guards).
 *
 * This is a divergence in HMR semantics: clone behaves differently from original
 * w.r.t. replace().
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  const guardFromConfig = (): (() => boolean) => () => false;

  const base = createRouter([
    {
      name: "home",
      path: "/",
    },
    {
      name: "admin",
      path: "/admin",
      canActivate: guardFromConfig, // DEFINITION origin
    },
  ]);

  await base.start("/");

  // 1) Verify in original — guard is from definition
  const baseStore = getInternals(base).routeGetStore();
  const baseLifecycle = baseStore.lifecycleNamespace as unknown as {
    "#definitionActivateGuardNames": Set<string>;
  };

  // Access via "as any" since private fields aren't exposed — try reflection
  // Instead, prove it via behaviour: replace() with empty routes should clear definition guards
  // For the original: admin has canActivate = false. After replace([{home}]), it's gone.

  const initialAdminBlocked = !base.canNavigateTo("admin");

  console.log("--- Original router ---");
  console.log("admin blocked (definition guard active):", initialAdminBlocked);

  // 2) Clone the router. According to cloneRouter.ts:52-58, guard re-added via
  //    public addActivateGuard → isFromDefinition=false in clone.
  const clone = cloneRouter(base);

  await clone.start("/");

  const cloneAdminBlocked = !clone.canNavigateTo("admin");

  console.log("\n--- Clone ---");
  console.log("admin blocked in clone (guard copied):", cloneAdminBlocked);

  // 3) Now invoke replace() on clone with just [home]. Definition guards should be cleared.
  //    External guards should survive. If our hypothesis is right — the guard survives
  //    as external in clone.
  getRoutesApi(clone).replace([{ name: "home", path: "/" }, { name: "admin", path: "/admin" }]);

  const adminBlockedAfterReplace = !clone.canNavigateTo("admin");

  console.log("\n--- After replace() on clone (admin route re-added without canActivate) ---");
  console.log("admin still blocked (guard survived replace):", adminBlockedAfterReplace);

  // For comparison: on original router, replace() would clear the definition guard
  getRoutesApi(base).replace([{ name: "home", path: "/" }, { name: "admin", path: "/admin" }]);
  const baseAdminBlockedAfterReplace = !base.canNavigateTo("admin");

  console.log("\n--- After replace() on ORIGINAL (admin route re-added without canActivate) ---");
  console.log("admin blocked on original after replace:", baseAdminBlockedAfterReplace);

  console.log("\n--- Verdict ---");
  if (adminBlockedAfterReplace && !baseAdminBlockedAfterReplace) {
    console.log("→ Bug CONFIRMED: Guard origin tracking is lost in clone.");
    console.log("  Definition guard becomes external in clone (survives replace).");
    console.log("  Original: replace() clears it. Clone: replace() does not.");
    process.exitCode = 1;
  } else if (adminBlockedAfterReplace && baseAdminBlockedAfterReplace) {
    console.log("→ Both behave same (both keep). Likely both definition guards survive replace incorrectly.");
    process.exitCode = 2;
  } else if (!adminBlockedAfterReplace && !baseAdminBlockedAfterReplace) {
    console.log("→ Both behave same (both cleared). Origin tracking preserved or not relevant.");
    process.exitCode = 0;
  } else {
    console.log("→ Inconclusive.");
    process.exitCode = 3;
  }

  // Silence unused import
  void baseLifecycle;
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});

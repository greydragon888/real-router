/**
 * Probe 01 (2026-07-03): definition × external origin matrix, live-verified
 * through the public API (createRouter / getLifecycleApi / getRoutesApi).
 *
 * Verifies the cross-cutting matrix the namespace-deep-audit-route-lifecycle
 * prompt requires, plus hunts the suspected ZOMBIE-compiled seam:
 * `clearDefinitionGuards` (the replace() path) leaves the compiled function
 * untouched for both-slot names on the assumption "external already won at
 * registration time" (RouteLifecycleNamespace.ts:303-328 jsdoc) — but
 * registration is "last add wins regardless of origin" (:207-210), so a
 * definition guard registered AFTER an external one (update() over
 * addActivateGuard) stays compiled after replace() erased its factory.
 *
 *   Q1  add(route with canActivate config) → definition guard enforced
 *   Q2  external added over definition → external effective (last add wins)
 *   Q3  definition (update) added over external → definition effective
 *   Q4  update(name, {canActivate: null}) with live external → external
 *       survives AND becomes effective (#952 + recompile external-wins)
 *   Q5  removeActivateGuard(name) with both slots → both erased (documented
 *       "clears BOTH" default)
 *   Q6  ZOMBIE: ext-block → update(def-allow) → replace(same routes, no
 *       config guard) → expected: external block enforced; suspected: stale
 *       definition ALLOW still compiled → navigate passes + diverges from
 *       get().canActivate (which shows the external factory)
 *   Q6b CONTRAST: def-first → ext-block-last → replace → external block stays
 *       (assumption holds when external was the last add)
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? String(e);

function makeRoutes(withAdminGuard?: "allow" | "block"): Route[] {
  return [
    { name: "home", path: "/" },
    withAdminGuard
      ? {
          name: "admin",
          path: "/admin",
          canActivate: () => () => withAdminGuard === "allow",
        }
      : { name: "admin", path: "/admin" },
  ];
}

async function navOutcome(router: Router, target: string): Promise<string> {
  try {
    const s = await router.navigate(target);

    return `RESOLVED(${s.name})`;
  } catch (e) {
    return `rejected:${code(e)}`;
  } finally {
    // Return to home so each question starts from the same state.
    await router.navigate("home").catch(() => {});
  }
}

void (async () => {
  // ---------- Q1: definition guard from route config enforced ----------
  {
    const router = createRouter(makeRoutes("block"));

    await router.start("/");

    const out = await navOutcome(router, "admin");

    console.log(
      `Q1 def-config guard      → navigate=${out} canNavigateTo=${router.canNavigateTo(
        "admin",
      )}  ${out === "rejected:CANNOT_ACTIVATE" ? "OK" : "FAIL"}`,
    );
    router.dispose();
  }

  // ---------- Q2: external over definition — last add wins ----------
  {
    const router = createRouter(makeRoutes("allow"));

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK, added last

    const out = await navOutcome(router, "admin");

    console.log(
      `Q2 ext-last over def     → navigate=${out}  ${
        out === "rejected:CANNOT_ACTIVATE" ? "OK (last add wins)" : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q3: definition (update) over external — last add wins ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK
    getRoutesApi(router).update("admin", { canActivate: () => () => true }); // def ALLOW, last

    const out = await navOutcome(router, "admin");

    console.log(
      `Q3 def-last over ext     → navigate=${out}  ${
        out === "RESOLVED(admin)" ? "OK (last add wins)" : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q4: update(null) clears definition only, external takes over ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK
    getRoutesApi(router).update("admin", { canActivate: () => () => true }); // def ALLOW (effective)
    getRoutesApi(router).update("admin", { canActivate: null }); // clear def only (#952)

    const out = await navOutcome(router, "admin");

    console.log(
      `Q4 update(null)+ext      → navigate=${out}  ${
        out === "rejected:CANNOT_ACTIVATE"
          ? "OK (external took over)"
          : "FAIL (external lost)"
      }`,
    );
    router.dispose();
  }

  // ---------- Q5: removeActivateGuard clears BOTH slots ----------
  {
    const router = createRouter(makeRoutes("block")); // def BLOCK

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK too
    getLifecycleApi(router).removeActivateGuard("admin"); // default: both slots

    const out = await navOutcome(router, "admin");

    console.log(
      `Q5 remove clears both    → navigate=${out}  ${
        out === "RESOLVED(admin)" ? "OK (documented both-slot clear)" : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q6 ZOMBIE: ext-block → def-allow(update) → replace ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK
    getRoutesApi(router).update("admin", { canActivate: () => () => true }); // def ALLOW, last add
    getRoutesApi(router).replace(makeRoutes()); // strips definition guards; new batch has none

    const effective = await navOutcome(router, "admin");
    const apiView = getRoutesApi(router).get("admin")?.canActivate;
    const apiSaysBlock =
      typeof apiView === "function" ? "external-factory" : String(apiView);
    const canNav = router.canNavigateTo("admin");

    console.log(
      `Q6 ZOMBIE after replace  → navigate=${effective} canNavigateTo=${canNav} get().canActivate=${apiSaysBlock}`,
    );
    console.log(
      `   verdict: ${
        effective === "rejected:CANNOT_ACTIVATE"
          ? "OK (external enforced)"
          : "VIOLATION (stale definition guard compiled — replace() left a zombie; API view diverges from behavior)"
      }`,
    );
    router.dispose();
  }

  // ---------- Q6b CONTRAST: def-first, ext-block-last → replace ----------
  {
    const router = createRouter(makeRoutes("allow")); // def ALLOW at construction

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false); // ext BLOCK, last add
    getRoutesApi(router).replace(makeRoutes()); // strips definition guards

    const out = await navOutcome(router, "admin");

    console.log(
      `Q6b contrast ext-last    → navigate=${out}  ${
        out === "rejected:CANNOT_ACTIVATE"
          ? "OK (external stays effective — assumption holds for ext-last order)"
          : "unexpected"
      }`,
    );
    router.dispose();
  }

  console.log("probe-01 done");
})();

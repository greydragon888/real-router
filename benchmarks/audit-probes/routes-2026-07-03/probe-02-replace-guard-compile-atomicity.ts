/**
 * Probe 02 (2026-07-03): atomicity of a FAILED replace() when the new batch
 * carries a guard factory that throws on compile (#956 seam, replace side).
 *
 * Code-read hypothesis: `replaceRoutes` runs `clearDefinitionGuards()` BEFORE
 * `adoptRouteArtifacts` (getRoutesApi.ts: preflight → clearDefinitionGuards →
 * adopt), while the #956 compile-throw fires inside adopt (pre-swap). So a
 * malformed factory aborts AFTER the old definition guards were cleared:
 * tree stays, but the old route-config guards are silently LOST.
 * Documented contract: CLAUDE.md "Atomic Route Replacement" — validation/build
 * throws leave the tree unchanged (atomicity); #1046 explicitly hoisted the
 * LIMIT throw "so an at-limit batch aborts before clearDefinitionGuards()/swap"
 * — the compile-throw path was left behind.
 *
 *   QA replace(batch with throwing canActivate factory):
 *      before: definition guard BLOCKS admin. After the failed replace —
 *      tree unchanged (routes intact), but does the old guard still block?
 *   QB contrast: add() with a throwing factory — no clear step → guard intact.
 *   QC external guard on the same router — must survive either way
 *      (clearDefinitionGuards never touches external).
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? (e as any)?.message ?? String(e);

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    {
      name: "admin",
      path: "/admin",
      canActivate: () => () => false, // definition guard BLOCKS
    },
    { name: "about", path: "/about" },
  ];
}

const throwingBatch = (): Route[] => [
  { name: "home", path: "/" },
  { name: "admin", path: "/admin" },
  {
    name: "about",
    path: "/about",
    canActivate: (() => {
      throw new Error("factory exploded on compile");
    }) as never,
  },
];

void (async () => {
  // ---------- QA: failed replace loses old definition guards? ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    const blockedBefore = await router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    let replaceOutcome = "no-throw";

    try {
      getRoutesApi(router).replace(throwingBatch());
    } catch (e) {
      replaceOutcome = `threw: ${code(e)}`;
    }

    const treeIntact =
      getRoutesApi(router).has("admin") && getRoutesApi(router).has("about");
    const blockedAfter = await router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    console.log(
      `QA failed replace   → before=${blockedBefore} replace=${replaceOutcome} treeIntact=${treeIntact} after=${blockedAfter}`,
    );
    console.log(
      `   verdict: ${
        blockedAfter === "rejected:CANNOT_ACTIVATE"
          ? "OK (definition guards survived the failed replace)"
          : "VIOLATION (failed replace silently ERASED the old definition guards — clearDefinitionGuards ran before the compile abort)"
      }`,
    );
    router.dispose();
  }

  // ---------- QB contrast: failed add keeps guards (no clear step) ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    let addOutcome = "no-throw";

    try {
      getRoutesApi(router).add([
        {
          name: "extra",
          path: "/extra",
          canActivate: (() => {
            throw new Error("factory exploded on compile");
          }) as never,
        },
      ]);
    } catch (e) {
      addOutcome = `threw: ${code(e)}`;
    }

    const blockedAfter = await router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    console.log(
      `QB failed add       → add=${addOutcome} extraExists=${getRoutesApi(
        router,
      ).has("extra")} adminGuard=${blockedAfter}  ${
        blockedAfter === "rejected:CANNOT_ACTIVATE"
          ? "OK (contrast: add path atomic)"
          : "unexpected"
      }`,
    );
    router.dispose();
  }

  // ---------- QC: external guard must survive the failed replace ----------
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
      { name: "about", path: "/about" },
    ]);

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => false);

    try {
      getRoutesApi(router).replace(throwingBatch());
    } catch {
      /* expected */
    }

    const blockedAfter = await router.navigate("admin").then(
      () => "RESOLVED",
      (e) => `rejected:${code(e)}`,
    );

    console.log(
      `QC external guard   → after failed replace: ${blockedAfter}  ${
        blockedAfter === "rejected:CANNOT_ACTIVATE"
          ? "OK (external survives — clearDefinitionGuards never touches it)"
          : "VIOLATION (external guard lost too)"
      }`,
    );
    router.dispose();
  }

  console.log("probe-02 done");
})();

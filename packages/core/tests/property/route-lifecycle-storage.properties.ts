import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import { createFixtureRouter, ROUTES, NUM_RUNS } from "./helpers";

// =============================================================================
// Storage invariants of RouteLifecycleNamespace, exercised through the PUBLIC
// API only (getLifecycleApi / getRoutesApi + canNavigateTo). No white-box
// access to the namespace's private Maps — origin (definition vs external) is
// driven via the public surfaces that set `isFromDefinition`:
//   - external  → getLifecycleApi(router).addActivateGuard / addDeactivateGuard
//   - definition→ getRoutesApi(router).update(name, { canActivate })  (true)
//   - clear definition-only → getRoutesApi(router).replace(routes)
//   - clear external-only   → getLifecycleApi(router).removeActivateGuard (#1171)
// Effect is observed via router.canNavigateTo(name).
// =============================================================================

/** Param-free navigable leaves — canNavigateTo needs no params to build their path. */
const PARAM_FREE_TARGETS = [
  "users.list",
  "admin.dashboard",
  "admin.settings",
] as const;

const arbTarget = fc.constantFrom(
  ...(PARAM_FREE_TARGETS as unknown as [string, ...string[]]),
);

/** Fresh deep copy of the fixture for replace() — never hand replace the shared const. */
function freshRoutes(): typeof ROUTES {
  return structuredClone(ROUTES);
}

describe("RouteLifecycleNamespace storage invariants (public API)", () => {
  test.prop([arbTarget], { numRuns: NUM_RUNS.fast })(
    "EXTERNAL_SURVIVES_REPLACE (activate): an external canActivate guard still blocks after replace()",
    async (target) => {
      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      await router.start("/");

      lifecycle.addActivateGuard(target, () => () => false); // external, blocks

      expect(router.canNavigateTo(target)).toBe(false);

      routes.replace(freshRoutes()); // new tree, no config guards

      // External guards are filed in the external Map; clearDefinitionGuards()
      // (replace step) must not touch them.
      expect(router.canNavigateTo(target)).toBe(false);

      router.stop();
    },
  );

  test.prop([arbTarget], { numRuns: NUM_RUNS.fast })(
    "EXTERNAL_SURVIVES_REPLACE (def-after-ext): a definition guard added AFTER an external one never becomes effective (external-wins) and leaves no zombie after replace() (#1192 #1174)",
    async (target) => {
      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      await router.start("/");

      // external BLOCKS; then a definition guard (via update) tries to ALLOW the
      // same slot. Resolution is external-wins (#1174), so the compiled function
      // stays the external (blocking) guard regardless of registration order —
      // the definition is stored (for a later clearDefinitionGuards) but never
      // becomes the effective guard while the external is live.
      lifecycle.addActivateGuard(target, () => () => false);
      routes.update(target, { canActivate: () => () => true });

      expect(router.canNavigateTo(target)).toBe(false);

      routes.replace(freshRoutes()); // strips definition guards

      // The external (blocking) guard was the compiled slot all along, so it
      // survives replace() with no zombie — clearDefinitionGuards' recompile is
      // idempotent under external-wins (the slot is already external).
      expect(router.canNavigateTo(target)).toBe(false);

      router.stop();
    },
  );

  test.prop([arbTarget], { numRuns: NUM_RUNS.fast })(
    "EXTERNAL_SURVIVES_REPLACE (deactivate): an external canDeactivate guard still blocks leaving after replace()",
    async (target) => {
      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      await router.start("/");
      await router.navigate(target); // param-free → no params needed

      lifecycle.addDeactivateGuard(target, () => () => false); // external, blocks leaving

      expect(router.canNavigateTo("home")).toBe(false);

      routes.replace(freshRoutes()); // current path still matches target after swap

      expect(router.canNavigateTo("home")).toBe(false);

      router.stop();
    },
  );

  test.prop([arbTarget], { numRuns: NUM_RUNS.fast })(
    "DEFINITION_CLEARED_BY_REPLACE: a definition canActivate guard (via update) is dropped by replace()",
    async (target) => {
      const router = createFixtureRouter();
      const routes = getRoutesApi(router);

      await router.start("/");

      routes.update(target, { canActivate: () => () => false }); // definition, blocks

      expect(router.canNavigateTo(target)).toBe(false);

      routes.replace(freshRoutes()); // replacement has no canActivate for target

      // Definition guards live in the definition Map; clearDefinitionGuards()
      // clears them, and the replacement tree re-declares none → unguarded.
      expect(router.canNavigateTo(target)).toBe(true);

      router.stop();
    },
  );

  test.prop(
    [arbTarget, fc.array(fc.boolean(), { minLength: 1, maxLength: 6 })],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "LAST_ADD_WINS: canNavigateTo reflects the most recent external add",
    async (target, decisions) => {
      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);

      await router.start("/");

      for (const allow of decisions) {
        lifecycle.addActivateGuard(target, () => () => allow);
      }

      const last = decisions.at(-1);

      expect(router.canNavigateTo(target)).toBe(last);

      router.stop();
    },
  );

  test.prop([arbTarget, fc.boolean(), fc.boolean()], {
    numRuns: NUM_RUNS.standard,
  })(
    "REMOVE_CLEARS_EXTERNAL_ONLY: removeActivateGuard drops the external guard but preserves a definition (config) one (#1171)",
    async (target, useDefinition, useExternal) => {
      fc.pre(useDefinition || useExternal);

      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      await router.start("/");

      if (useDefinition) {
        routes.update(target, { canActivate: () => () => false });
      }
      if (useExternal) {
        lifecycle.addActivateGuard(target, () => () => false);
      }

      // Whatever the origin mix, the route is blocked before removal.
      expect(router.canNavigateTo(target)).toBe(false);

      // removeActivateGuard is the inverse of addActivateGuard: it clears only
      // the EXTERNAL slot. A definition (config) guard survives — removing it is
      // update(name, { canActivate: null })'s job, not the external-guard API's.
      lifecycle.removeActivateGuard(target);

      // Blocked afterwards iff a definition guard was set (it survived); a purely
      // external guard is gone, so canNavigateTo is allowed (true) only then.
      expect(router.canNavigateTo(target)).toBe(!useDefinition);

      router.stop();
    },
  );
});

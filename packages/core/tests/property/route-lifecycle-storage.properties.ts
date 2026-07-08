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
//   - clear both slots      → getLifecycleApi(router).removeActivateGuard
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
    "EXTERNAL_SURVIVES_REPLACE (def-after-ext): a definition guard added AFTER an external one leaves no zombie after replace() (#1192)",
    async (target) => {
      const router = createFixtureRouter();
      const lifecycle = getLifecycleApi(router);
      const routes = getRoutesApi(router);

      await router.start("/");

      // external BLOCKS; then a definition guard (via update) ALLOWS the same
      // slot — registration is last-add-wins, so the compiled function is now
      // the definition (allowing) guard.
      lifecycle.addActivateGuard(target, () => () => false);
      routes.update(target, { canActivate: () => () => true });

      expect(router.canNavigateTo(target)).toBe(true);

      routes.replace(freshRoutes()); // strips definition guards

      // The surviving external (blocking) guard must be recompiled into the
      // slot — not left as the erased definition (allowing) zombie.
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
    "REMOVE_CLEARS_REGARDLESS_OF_ORIGIN: removeActivateGuard drops the guard whether definition, external, or both",
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

      lifecycle.removeActivateGuard(target); // origin-blind: clears both slots

      expect(router.canNavigateTo(target)).toBe(true);

      router.stop();
    },
  );
});

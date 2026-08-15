import type { RouterLogger } from "../../types";

/**
 * Validates removeRoute constraints.
 * Returns false if removal should be blocked (route is active).
 * Logs warnings for edge cases.
 *
 * @param name - Route name to remove
 * @param currentStateName - Current active route name (or undefined)
 * @param isNavigating - Whether navigation is in progress
 * @param logger - Per-router logger instance (from `getInternals(router).logger`)
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  isNavigating: boolean,
  logger: RouterLogger,
): boolean {
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    const isParentOfCurrent = currentStateName.startsWith(`${name}.`);

    if (isExactMatch || isParentOfCurrent) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  if (isNavigating) {
    logger.warn(
      "router.removeRoute",
      `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
    );
  }

  return true;
}

/** The root path minus its `?`-declared query names — the half that moves paths. */
function pathPartOf(rootPath: string): string {
  const queryAt = rootPath.indexOf("?");

  return queryAt === -1 ? rootPath : rootPath.slice(0, queryAt);
}

/**
 * Validates a `setRootPath` against an in-flight navigation (#1755).
 *
 * `applyRootPath` rebuilds the tree AND the matcher from the same definitions
 * (`routesStore.ts`), so every route name survives and every route's path is
 * REBUILT under the new root — which moves them all at once whenever the root's
 * path half changes. That is the same whole-tree REBUILD `clear` and `replace`
 * are refused for (not destruction: those two can drop names, this one never
 * does), and of the three it was the only one that applied anyway. A
 * navigation's activation guard could move the URL out from under its own
 * transition, and the transition then committed a state naming a route the tree
 * no longer routes that path to — which the same navigation's success announce
 * hands straight to every URL plugin, address bar included.
 *
 * ⚠ "the only one that applied" is about the three whole-tree ops, not about
 * the six doors: `add` proceeds with no check at all and `update` proceeds after
 * a log. Their in-flight policy is deliberately different — see the CRUD table
 * in `packages/core/CLAUDE.md`.
 *
 * ⚠ The refusal is `logger.error` + no-op, NOT a throw, and that follows the
 * family's own rule rather than `setRootPath`'s neighbours on `PluginApi`: a
 * condition that clears by itself (a navigation settles) gets a log, one that
 * never does gets a throw. The reentrancy ban beside this one throws for
 * exactly that reason — a `TREE_CHANGED` dispatch is not something you can wait
 * out from inside it.
 *
 * @param currentRootPath - The root path in effect
 * @param nextRootPath - The root path being set
 * @param isNavigating - Whether navigation is in progress
 * @param logger - Per-router logger instance (from `getInternals(router).logger`)
 * @returns true if setRootPath can proceed, false if blocked
 */
export function validateSetRootPath(
  currentRootPath: string,
  nextRootPath: string,
  isNavigating: boolean,
  logger: RouterLogger,
): boolean {
  // Only the PATH half of the root moves route paths; the `?name` half declares
  // query params on every route and moves nothing. Measured, with the gate off:
  // `"" → "/app"` mid-navigation commits `state.path` the tree cannot match,
  // while `"" → "?lang"` and `"?lang" → ""` both commit a state that still
  // round-trips. So the refusal is scoped to the half that does the damage.
  //
  // ⚑ Scoping it is not a nicety — the whole-string form was a REGRESSION.
  // `@real-router/persistent-params-plugin` declares its keys with a query-only
  // root (`setRootPath("?lang")`) and restores the original in `teardown()`. An
  // `unsubscribe()` reached from a guard or a `subscribeLeave` listener would
  // have found that restore silently refused — no throw, so the plugin's own
  // `catch` could not see it — leaving `?lang` declared on a router the caller
  // believes is clean, where a later `navigate("x", { lang })` throws
  // `WRONG_CHANNEL` for a plugin that is no longer installed.
  if (
    isNavigating &&
    pathPartOf(currentRootPath) !== pathPartOf(nextRootPath)
  ) {
    logger.error(
      "router.setRootPath",
      "Cannot change the root PATH while navigation is in progress — it moves every route's path, including the one being navigated to. Wait for navigation to complete. (Changing only the `?`-declared query names is allowed here: it moves no paths.)",
    );

    return false;
  }

  return true;
}

/**
 * Validates clearRoutes operation.
 * Returns false if operation should be blocked (navigation in progress).
 *
 * @param isNavigating - Whether navigation is in progress
 * @param logger - Per-router logger instance (from `getInternals(router).logger`)
 * @returns true if clearRoutes can proceed, false if blocked
 */
export function validateClearRoutes(
  isNavigating: boolean,
  logger: RouterLogger,
): boolean {
  if (isNavigating) {
    logger.error(
      "router.clearRoutes",
      "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
    );

    return false;
  }

  return true;
}

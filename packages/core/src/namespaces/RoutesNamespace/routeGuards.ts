import type { RouterLogger } from "../../types";

/**
 * Validates removeRoute constraints.
 * Returns false if removal should be blocked (route is active).
 *
 * ⚠ This is the GATE only. The in-flight report is
 * {@link warnRemovalDuringNavigation}, and it deliberately does NOT live here:
 * it describes what a removal did to a navigation, which is not knowable until
 * the removal is known to have happened at all (#1756).
 *
 * @param name - Route name to remove
 * @param currentStateName - Current active route name (or undefined)
 * @param logger - Per-router logger instance (from `getInternals(router).logger`)
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  logger: RouterLogger,
): boolean {
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    // ⚑ The prefix IS the ancestry test again, and that is a consequence of
    // #1763 rather than a step back from #1757.
    //
    // #1757 replaced this line with a walk of the matcher's segment chain,
    // because core accepted a dotted LEAF: a standalone `x.y` declared beside
    // `x` matched `startsWith("x.")` and made `remove("x")` refuse with `it is
    // currently active (current: "x.y")` — a sentence that was false about a
    // route nothing was removing — and it fired for a `name` that was not a
    // route at all, masking the not-found report it runs above.
    //
    // #1763 removed the shape instead: a route NAME cannot carry a dot, so a
    // dotted committed name implies its ancestor EXISTS and is a real ancestor.
    // Measured, not assumed — the two forms were probed on every shape still
    // constructible and agree on all of them, which is why the chain walk, its
    // `matcher` parameter and the O(depth) lookup are gone from a cold path.
    //
    // ⚠ The SIBLING half of #1757 is NOT equivalent and stays: `spliceSubtree`
    // still reports the names the splice actually took, because the lifecycle
    // registry is the one registry `add`/`replace` never gated — an external
    // guard can still be registered for a dotted name that is not a route, and
    // clearing it by prefix is the fail-open #1757 was filed for. See
    // `removeRoute.test.ts`.
    const isInRemovedSubtree =
      isExactMatch || currentStateName.startsWith(`${name}.`);

    if (isInRemovedSubtree) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  return true;
}

/**
 * Reports a removal that landed while a navigation was in flight (#1756).
 *
 * ⚠ Called from the `remove()` door AFTER the removal is known to have
 * happened — deliberately NOT from `validateRemoveRoute`, which runs above the
 * existence check. Everything below is a consequence of a route leaving the
 * tree, so for a `name` that is no route there is nothing to report and the
 * door's own "not found. No changes made." is the whole story. Warning from the
 * gate produced two adjacent, contradicting lines out of one call.
 *
 * @param name - Route name that was removed
 * @param logger - Per-router logger instance (from `getInternals(router).logger`)
 */
export function warnRemovalDuringNavigation(
  name: string,
  logger: RouterLogger,
): void {
  // ⚑ Says the MECHANISM, not "may cause unexpected behavior" (#1756). The
  // removal proceeds — deliberately: the guard above protects the COMMITTED
  // state, and the route being navigated TO is not it. If the removed subtree
  // is on the in-flight navigation's path, that navigation is cancelled by
  // the commit door instead, and the committed state is left untouched. So
  // the outcome is safe in both directions.
  //
  // ⚠ "safe" needs a WELL-FORMED tree, and every tree is one: bare core refuses
  // a dotted route name at registration (#1763), so the shape below is
  // UNCONSTRUCTIBLE rather than merely rare. Kept as the record of why the door
  // and this guard ask different questions. The commit door asks
  // `hasRoute(toState.name)` — the terminal only, never its ancestors — while
  // this guard's refusal covers the whole dotted ancestry. When an ancestor is
  // a SEPARATE definition rather than a `children` entry, removing it does not
  // take the descendant with it, the door sees a live terminal, and the
  // navigation commits with `transition.segments.activated` naming a route
  // `has()` denies: `buildPath` on that segment throws and `isActiveRoute`
  // answers true for it. With nested `children` the subtree goes together and
  // the door refuses, which is the shape this comment describes.
  //
  // ⚠ The gap this closes is NARROWER than "the caller cannot tell", and
  // narrower than "the rejection already carries the removed route's name":
  // measured, it carries
  // the name the COMMIT DOOR could not find — the navigation's TARGET — on the
  // async arcs as `ROUTE_NOT_FOUND { routeName }` directly and on the sync arc
  // threaded through `asCancellation` as `error.reason`. Those coincide only
  // when you removed the target itself. Remove an ANCESTOR of it — the shape
  // this warning's own parenthetical calls out, and the one #1756 reproduces —
  // and the payload names the descendant, never the route you passed to
  // `remove()`. So nothing in the error connects the failure to the call that
  // caused it, and the WARNING is the only place that can.
  //
  // ⚠ It cannot name WHICH of the two happened: telling "you removed the
  // route you are navigating to" from "you removed an unrelated route" needs
  // the in-flight target, and `RouterInternals` deliberately exposes no
  // handle on the navigation in flight. Saying both outcomes is the honest
  // form until that changes.
  //
  // ⚠ It prints the code VALUES, not the `errorCodes` keys:
  // `errorCodes.TRANSITION_CANCELLED === "CANCELLED"` (`constants.ts`), so a
  // caller who matched the key read out of a log line would never match.
  //
  // ⚠ And it splits the two codes by CHANNEL, not only by arc, because they
  // do not agree on the synchronous one. Measured: the rejected `navigate()`
  // promise carries `"CANCELLED"` there while `onTransitionError` carries
  // `"ROUTE_NOT_FOUND"` — one failure, two codes, depending on where the
  // caller is listening. `onTransitionCancel` never fires on this path at
  // all (`CANCEL` is sent only by `stop()`/`dispose()` and the
  // external-signal bridge), so the hook is the STABLE predicate of the two
  // and the sentence says which is which. Naming the arc split and then
  // appending the hook reads as "the hook carries these codes" — true on the
  // async arc, false on the sync one.
  //
  // ⚠ It names BOTH failure codes, and neither alone is right.
  // `TRANSITION_CANCELLED` holds only
  // while the guard walk is still synchronous, where `handleNavigateError`
  // finds the machine already out of the band and rewraps. Once the walk has
  // gone async the raw `ROUTE_NOT_FOUND` from the commit door reaches the
  // caller unwrapped. Measured on four arcs: sync guard `CANCELLED`, async
  // activate / async deactivate / async `subscribeLeave` all `ROUTE_NOT_FOUND`.
  //
  // ⚠ And it may now SAY the removal happened, because it is only reached once
  // it has. While this lived in the gate it ran above the existence check, so
  // `remove("nope")` mid-navigation was told `Route "nope" removed` and then,
  // one line later, `Route "nope" not found. No changes made.` The first
  // attempt at that dropped the trailing "the removal is applied" and left the
  // opening clause asserting the same thing — which is why the regression test
  // for it now pins the property (no in-flight report when nothing was
  // removed) instead of the absence of a discarded draft's wording.
  logger.warn(
    "router.removeRoute",
    `Route "${name}" removed while navigation is in progress. Removing a route the ` +
      `router is navigating to (or an ancestor of it) fails that navigation. The ` +
      `rejected navigate() promise carries "CANCELLED" while the guard walk is ` +
      `synchronous and "ROUTE_NOT_FOUND" once it has gone async; onTransitionError ` +
      `always reports "ROUTE_NOT_FOUND", and onTransitionCancel never fires. The ` +
      `committed state is not affected either way.`,
  );
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

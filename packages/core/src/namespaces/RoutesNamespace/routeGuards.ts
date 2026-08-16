import type { Matcher } from "../../engine";
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
 * @param matcher - The live matcher — asked whether the committed route is
 *   INSIDE the subtree being removed
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  isNavigating: boolean,
  logger: RouterLogger,
  matcher: Matcher,
): boolean {
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    // ⚑ Asked of the TREE, not of the name string (#1757). The segment chain of
    // the committed route contains `name` exactly when `name` is one of its
    // ANCESTORS — which is the question the refusal means. `startsWith(name +
    // ".")` answered a wider one: core accepts a dotted LEAF, so a standalone
    // `x.y` declared beside `x` matched the prefix and made `remove("x")` refuse
    // with `it is currently active (current: "x.y")` — a sentence that is false
    // about a route nothing was removing. It also fired for a `name` that is not
    // a route AT ALL, and since it runs above the existence check the caller was
    // told "currently active" instead of "not found"; a chain lookup returns
    // `undefined` there and the not-found report survives.
    //
    // ⚠ The `isExactMatch ||` in front is a SHORT-CIRCUIT, not a second rule:
    // a route's own chain ends with itself, so the lookup answers `true` for the
    // exact case too and dropping the term leaves the whole tier green (checked
    // — it is an equivalent mutant). It stays because it is the cheap answer to
    // the common case, and because it is the ONE reading that does not depend on
    // the committed route still being in the matcher.
    const isInRemovedSubtree =
      isExactMatch ||
      (matcher
        .getSegmentsByName(currentStateName)
        ?.some((segment) => segment.fullName === name) ??
        false);

    if (isInRemovedSubtree) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  if (isNavigating) {
    // ⚑ Says the MECHANISM, not "may cause unexpected behavior" (#1756). The
    // removal proceeds — deliberately: the guard above protects the COMMITTED
    // state, and the route being navigated TO is not it. If the removed subtree
    // is on the in-flight navigation's path, that navigation is cancelled by
    // the commit door instead, and the committed state is left untouched. So
    // the outcome is safe in both directions.
    //
    // ⚠ "safe" used to hold only for a WELL-FORMED tree, and every tree is one
    // now: bare core refuses a dotted route name at registration (#1763), so the
    // shape below is UNCONSTRUCTIBLE rather than merely rare. Kept as the record
    // of why the door and this guard ask different questions. The commit door asks
    // `hasRoute(toState.name)` — the terminal only, never its ancestors — while
    // this guard's refusal covers the whole dotted ancestry. When an ancestor is
    // a SEPARATE definition rather than a `children` entry, removing it does not
    // take the descendant with it, the door sees a live terminal, and the
    // navigation commits with `transition.segments.activated` naming a route
    // `has()` denies: `buildPath` on that segment throws and `isActiveRoute`
    // answers true for it. With nested `children` the subtree goes together and
    // the door refuses, which is the shape this comment describes.
    //
    // ⚠ The gap this closes is NARROWER than "the caller cannot tell": measured,
    // the rejection already carries the removed route's name — on the async arcs
    // as `ROUTE_NOT_FOUND { routeName }` directly, on the sync arc threaded
    // through `asCancellation` as `error.reason`, and `onTransitionError` fires
    // with the route name on both. What was missing is only that the WARNING
    // stopped at "may cause unexpected behavior" and never said a navigation
    // could die of it, so a caller reading the log had no reason to go looking
    // at `error.reason` in the first place.
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
    // and the sentence says which is which. The previous draft named the arc
    // split and then appended the hook, which reads as "the hook carries these
    // codes" — true on the async arc, false on the sync one.
    //
    // ⚠ It names BOTH failure codes, and that is a correction rather than
    // thoroughness. The first draft promised `TRANSITION_CANCELLED` — true only
    // while the guard walk is still synchronous, where `handleNavigateError`
    // finds the machine already out of the band and rewraps. Once the walk has
    // gone async the raw `ROUTE_NOT_FOUND` from the commit door reaches the
    // caller unwrapped. Measured on four arcs: sync guard `CANCELLED`, async
    // activate / async deactivate / async `subscribeLeave` all `ROUTE_NOT_FOUND`.
    //
    // ⚠ And it does NOT promise the removal happened: this guard runs ABOVE the
    // existence check, so `remove("nope")` mid-navigation reaches here too and
    // is followed by "not found. No changes made." The first draft said "the
    // removal is applied" and contradicted the very next log line.
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

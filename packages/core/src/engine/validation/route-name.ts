/**
 * The route-name rules, one named predicate each — the name-side counterpart to
 * {@link validateRoutePath} in `./routes`.
 *
 * Two layers apply them, and they apply different subsets. Bare-core
 * registration (`namespaces/RoutesNamespace/routesStore.ts`) applies the dotted
 * rule on every door; {@link validateRoute} — which core exports for
 * `@real-router/validation-plugin` and never calls itself — applies all of
 * them.
 *
 * ⚑ One owner per rule is the point of this file: putting a rule on the live
 * path is a CALL, never a second copy of its message (#2035).
 */

/**
 * Route names are ASCII — a letter or underscore, then letters, digits,
 * underscores or hyphens.
 */
const ROUTE_NAME_PATTERN = /^[A-Z_a-z][\w-]*$/;

/**
 * Matches when the name carries at least one non-whitespace character.
 */
const HAS_NON_WHITESPACE = /\S/;

/**
 * Maximum route name length, bounding DoS and performance risk.
 */
const MAX_ROUTE_NAME_LENGTH = 10_000;

/**
 * Refuses `{ name: "" }`.
 */
export function assertRouteNameNotEmpty(
  name: string,
  methodName: string,
): void {
  if (name === "") {
    throw new TypeError(`[router.${methodName}] Route name cannot be empty`);
  }
}

/**
 * Refuses a name built only of whitespace.
 */
export function assertRouteNameNotWhitespaceOnly(
  name: string,
  methodName: string,
): void {
  if (!HAS_NON_WHITESPACE.test(name)) {
    throw new TypeError(
      `[router.${methodName}] Route name cannot contain only whitespace`,
    );
  }
}

/**
 * Refuses a name longer than {@link MAX_ROUTE_NAME_LENGTH}.
 */
export function assertRouteNameWithinLength(
  name: string,
  methodName: string,
): void {
  if (name.length > MAX_ROUTE_NAME_LENGTH) {
    throw new TypeError(
      `[router.${methodName}] Route name exceeds maximum length of ${MAX_ROUTE_NAME_LENGTH} characters`,
    );
  }
}

/**
 * Refuses a BARE route name carrying a dot — `{ name: "users.view" }` where the
 * nesting must be spelled with `children` or `{ parent }` (#1763).
 *
 * ⚠ Carries no "@@" exemption. {@link validateRoute} returns early on a
 * reserved name before reaching this predicate, and bare-core registration
 * refuses one outright, so neither caller needs one.
 */
export function assertNoDottedRouteName(
  name: string,
  methodName: string,
): void {
  if (name.includes(".")) {
    throw new TypeError(
      `[router.${methodName}] Route name "${name}" cannot contain dots. ` +
        `Use children array or { parent } option in addRoute() instead.`,
    );
  }
}

/**
 * Refuses a name outside {@link ROUTE_NAME_PATTERN}.
 */
export function assertRouteNameMatchesPattern(
  name: string,
  methodName: string,
): void {
  if (!ROUTE_NAME_PATTERN.test(name)) {
    throw new TypeError(
      `[router.${methodName}] Invalid route name "${name}". ` +
        `Name must start with a letter or underscore, ` +
        `followed by letters, numbers, underscores, or hyphens.`,
    );
  }
}

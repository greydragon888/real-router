// packages/helpers/modules/routeRelation.ts

/**
 * Checks if two routes are related in the hierarchy.
 *
 * Routes are related if:
 * - They are exactly the same
 * - One is a parent of the other (e.g., "users" and "users.list")
 * - One is a child of the other (e.g., "users.list" and "users")
 *
 * @param route1 - First route name
 * @param route2 - Second route name
 * @returns True if routes are related, false otherwise
 *
 * @example
 * areRoutesRelated("users", "users.list");     // true (parent-child)
 * areRoutesRelated("users.list", "users");     // true (child-parent)
 * areRoutesRelated("users", "users");          // true (same)
 * areRoutesRelated("users", "admin");          // false (different branches)
 * areRoutesRelated("users.list", "users.view"); // false (siblings)
 */
export function areRoutesRelated(route1: string, route2: string): boolean {
  return (
    route1 === route2 ||
    route1.startsWith(`${route2}.`) ||
    route2.startsWith(`${route1}.`)
  );
}

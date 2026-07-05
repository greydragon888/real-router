/**
 * Probe 01: add(routes, { parent: "nonexistent" }) WITHOUT validation-plugin.
 *
 * Hypothesis: `validateParentOption` is invoked via optional chaining
 * (`ctx.validator?.routes.validateParentOption`, getRoutesApi.ts:434), so it is
 * a no-op when validation-plugin is absent. The commit path then dereferences
 * a non-null assertion `findDefinition(...)!` (getRoutesApi.ts:217) which
 * returns undefined for a missing parent → `parentDef.children ??= []` throws a
 * cryptic TypeError instead of the documented
 * `Parent route "nonexistent" does not exist` (wiki addRoute.md:150,186).
 *
 * Also checks atomicity: the throw happens before any store mutation, so the
 * tree must be unchanged (route NOT added).
 */

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const router = createRouter([{ name: "home", path: "/" }]);
const routesApi = getRoutesApi(router);

let err: Error | undefined;

try {
  routesApi.add({ name: "child", path: "/child" }, { parent: "nonexistent" });
} catch (e) {
  err = e as Error;
}

console.log("error name   :", err?.name);
console.log("error message:", err?.message);
console.log("tree unchanged (child absent):", routesApi.has("child") === false);

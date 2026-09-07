/**
 * Payload types for the internal `TREE_CHANGED` event — the post-commit,
 * fire-and-forget signal emitted after a structural route-tree mutation through
 * `getRoutesApi(router)`.
 *
 * The event is observed via `getRoutesApi(router).subscribeChanges(handler)`.
 * It is intentionally NOT part of the public `EventName` union, `Plugin`
 * interface, or `events.*` registry: tree mutations are an infrastructural
 * concern (DevTools, microfrontends, plugin coordination), not an app-level
 * event. See `.claude/rfc-tree-mutation-event.md` for the full rationale.
 */

import type {
  DefaultDependencies,
  ReadonlyRoute,
  RouteConfigUpdate,
} from "./router";

/**
 * The subset of {@link RouteConfigUpdate} fields that count as **structural**
 * changes — the only ones that emit `TREE_CHANGED` from `update()`.
 *
 * Guard fields (`canActivate` / `canDeactivate`) are deliberately excluded:
 * guards are invoked-on-demand (fresh-read per navigation), not cached derived
 * state, so they need no observation channel.
 */
export type TreeStructuralPatch<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Pick<
  RouteConfigUpdate<Dependencies>,
  | "forwardTo"
  | "defaultParams"
  | "defaultSearch"
  | "encodeParams"
  | "decodeParams"
>;

export interface TreeChangedAdd<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "add";
  /**
   * Top-level routes that were added.
   *
   * ⚠ **Read-only. How much of this is yours to write: none of it.**
   *
   * Core adopts the CHANNEL bags on the way in, one level. Every payload route
   * is a fresh shell built by core — writing `route.name` throws, writing
   * `route.path` is inert — and its `defaultParams` and `defaultSearch` are
   * core's own frozen copies, taken once when the route is registered or updated
   * (#1958 / #2172). A write there throws rather than landing.
   *
   * ⚠ The GUARD slots and custom-field VALUES still pass the caller's objects
   * through, and for two different reasons: a guard is a function, called
   * rather than enumerated; custom-field values are arbitrary application data
   * — schemas, factories, class instances — and plugins key caches on their
   * identity. `getRouteConfig`'s record AROUND them is frozen, so a key cannot
   * be injected into it, but what the values point at is still shared.
   *
   * Core neither deep-freezes (that would freeze the caller's own input) nor
   * deep-clones (config carries circular references and class instances) — see
   * "Immutability is shallow" in `packages/core/CLAUDE.md`. The adoption is one
   * level, matching that rule rather than replacing it.
   *
   * ⚠ So a **shallow** copy of a value that is still shared is not an escape
   * hatch: `{ ...someCustomField }` leaves `someCustomField.nested` shared. Copy
   * deeply, or do not write.
   *
   * ⚠ `encodeParams` / `decodeParams` are the one slot that does NOT pass the
   * caller's object through: the store wraps them at registration, so a payload
   * hands back core's wrapper.
   */
  readonly added: readonly ReadonlyRoute<Dependencies>[];
  /** Parent route name when added via `add(routes, { parent })`. */
  readonly parent?: string;
}

export interface TreeChangedRemove<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "remove";
  readonly name: string;
  /**
   * The removed route and all of its descendants, as a FLAT array (each entry's
   * `name` is the full dotted name). Collected before the mutation.
   *
   * ⚠ Read-only — see {@link TreeChangedAdd.added}. These routes are GONE from the
   * table, which changes WHEN the damage lands, not whose object it is: the config
   * is the same object it always was, the store has merely dropped its reference.
   * A write here still mutates the application's own literal, and re-registering
   * that literal carries it back in — measured, a poisoned bag re-added as a route
   * printed `/v/POISONED` (#1958).
   */
  readonly removedSubtree: readonly ReadonlyRoute<Dependencies>[];
}

export interface TreeChangedUpdate<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "update";
  readonly name: string;
  /**
   * Structural fields only.
   *
   * ⚠ Read-only, shaped like {@link TreeChangedAdd.added} with one difference that
   * matters: the envelope is rebuilt by core, but `patch.encodeParams` /
   * `patch.decodeParams` are the caller's RAW functions. This is the only door
   * assembled from the patch rather than from the store, so it alone escapes the
   * store's codec wrapper — `patch.encodeParams !== get(name).encodeParams` for
   * one and the same route (#1958).
   */
  readonly patch: Readonly<TreeStructuralPatch<Dependencies>>;
}

export interface TreeChangedReplace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "replace";
  /**
   * FLAT by all names (including descendants) present before but not after.
   *
   * ⚠ Read-only — see {@link TreeChangedAdd.added}, and
   * {@link TreeChangedRemove.removed} for why a REMOVED route is no safer than a
   * present one: the config is still the caller's own object (#1958).
   */
  readonly removed: readonly ReadonlyRoute<Dependencies>[];
  /**
   * FLAT by all names (including descendants) present after but not before.
   *
   * ⚠ Read-only — see {@link TreeChangedAdd.added}. These routes are still in the
   * table, so a write through this payload changes what the router resolves on the
   * very next navigation.
   */
  readonly added: readonly ReadonlyRoute<Dependencies>[];
}

export interface TreeChangedClear<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "clear";
  /**
   * Every route that existed before the clear, as a FLAT array — each entry's
   * `name` is the full dotted name and no entry carries a `children` key.
   * Measured `["user", "user.kid"]` for a parent with one child.
   *
   * ⚠ Read-only — see {@link TreeChangedAdd.added}, and
   * {@link TreeChangedRemove.removed} for why a REMOVED route is no safer than a
   * present one: the config is still the caller's own object (#1958).
   */
  readonly removed: readonly ReadonlyRoute<Dependencies>[];
}

/**
 * Discriminated union (by `op`) describing a single structural route-tree
 * mutation. Consumers should `switch (event.op)` with an exhaustive `default`
 * — do not rely on `Object.keys(event)`, array ordering, or absence of future
 * fields (see Invariant 11 in `.claude/rfc-tree-mutation-event.md`).
 */
export type TreeChangedEvent<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> =
  | TreeChangedAdd<Dependencies>
  | TreeChangedRemove<Dependencies>
  | TreeChangedUpdate<Dependencies>
  | TreeChangedReplace<Dependencies>
  | TreeChangedClear<Dependencies>;

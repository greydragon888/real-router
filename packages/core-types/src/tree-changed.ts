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

import type { DefaultDependencies, Route, RouteConfigUpdate } from "./router";

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
  "forwardTo" | "defaultParams" | "encodeParams" | "decodeParams"
>;

export interface TreeChangedAdd<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "add";
  /** Top-level routes that were added (deep-cloned + frozen; caller untouched). */
  readonly added: readonly Route<Dependencies>[];
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
   */
  readonly removedSubtree: readonly Route<Dependencies>[];
}

export interface TreeChangedUpdate<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "update";
  readonly name: string;
  /** Structural fields only (deep-cloned + frozen; caller's patch untouched). */
  readonly patch: Readonly<TreeStructuralPatch<Dependencies>>;
}

export interface TreeChangedReplace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "replace";
  /** FLAT by all names (including descendants) present before but not after. */
  readonly removed: readonly Route<Dependencies>[];
  /** FLAT by all names (including descendants) present after but not before. */
  readonly added: readonly Route<Dependencies>[];
}

export interface TreeChangedClear<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly op: "clear";
  /** Top-level routes (with nested children) that existed before the clear. */
  readonly removed: readonly Route<Dependencies>[];
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

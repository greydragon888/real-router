// packages/core/src/constants.ts

import type {
  EventToNameMap,
  EventToPluginMap,
  ErrorCodeToValueMap,
  ErrorCodeKeys,
  ErrorCodeValues,
  TransitionMeta,
} from "./types";

export type ConstantsKeys = "UNKNOWN_ROUTE";

export type Constants = Readonly<Record<ConstantsKeys, string>>;

// =============================================================================
// Error Codes (migrated from router-error)
// =============================================================================

export type ErrorCodes = Record<ErrorCodeKeys, ErrorCodeValues>;

/**
 * Error codes for router operations.
 * Used to identify specific failure scenarios in navigation and lifecycle.
 * Frozen to prevent accidental modifications.
 */
export const errorCodes: ErrorCodeToValueMap = Object.freeze({
  ROUTER_NOT_STARTED: "NOT_STARTED", // navigate() called before start()
  NO_START_PATH_OR_STATE: "NO_START_PATH_OR_STATE", // start() without initial route
  ROUTER_ALREADY_STARTED: "ALREADY_STARTED", // start() called twice
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND", // Navigation to non-existent route
  SAME_STATES: "SAME_STATES", // Navigate to current route without reload
  CANNOT_DEACTIVATE: "CANNOT_DEACTIVATE", // canDeactivate guard blocked navigation
  CANNOT_ACTIVATE: "CANNOT_ACTIVATE", // canActivate guard blocked navigation
  TRANSITION_ERR: "TRANSITION_ERR", // Generic transition failure
  TRANSITION_CANCELLED: "CANCELLED", // Navigation cancelled by user or new navigation
  ROUTER_DISPOSED: "DISPOSED", // Router has been disposed
  PLUGIN_CONFLICT: "PLUGIN_CONFLICT", // Plugin tried to extend router with already-existing property
  CONTEXT_NAMESPACE_ALREADY_CLAIMED: "CONTEXT_NAMESPACE_ALREADY_CLAIMED", // Plugin tried to claim a context namespace already owned by another plugin
  REENTRANT_NAVIGATION: "REENTRANT_NAVIGATION", // navigate() called synchronously from inside a transition-event listener (banned — use await/async listener)
  REENTRANT_TREE_MUTATION: "REENTRANT_TREE_MUTATION", // a tree mutator — route-CRUD or setRootPath (#1751) — called synchronously from inside a subscribeChanges handler (banned — use await/async/queueMicrotask)
  ROUTER_NOT_STOPPED: "NOT_STOPPED", // clear() called while a state is committed — tear down with stop() first, or swap the tree with replace() (#1612)
  WRONG_CHANNEL: "WRONG_CHANNEL", // a declared query key was supplied in the path channel (`params`) instead of `search` (#1572)
});

/**
 * General router constants.
 * Special route names and identifiers.
 */
export const UNKNOWN_ROUTE = "@@router/UNKNOWN_ROUTE";

/**
 * The one key the router will not copy into a state channel (#1792), and — at
 * `getDependenciesApi.getAll` — will not hand back out of a container either.
 *
 * ⚠ It does not REFUSE it — nothing throws, at any door or at registration; the
 * key is dropped where core copies into a CHANNEL, and kept everywhere else.
 * `claim.write` (#1191) and the route-record merge (#1788) keep it on purpose:
 * a plugin's context namespace and a route's custom fields are not containers a
 * consumer merges. ⚠ Neither of those spells the literal any more — both go
 * through `putField` (#1852), which keeps every name — so a `grep` for this
 * constant no longer finds the sites that carry the opposite contract.
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key is created, the value vanishes with no error and no log,
 * and an OBJECT value replaces the target's prototype instead.
 *
 * ⚠ It does NOT follow that "every idiom in core that copies a foreign bag has
 * to NAME it". `putField` (#1852) defines rather than assigns, so no copy loses
 * the key by accident; the sites that name it in `helpers.ts` do so to
 * DROP it deliberately, which is a different decision made for a different
 * reason — see below.
 *
 * ⚑ **What is guaranteed, precisely.** A bag that is ORDINARY — plain data that
 * does not change while the router is reading it — cannot put this key among the
 * OWN KEYS of `state.params` or `state.search`. The guarantee is one level deep,
 * and deliberately so: every copy here is `copy[key] = value`, so a value that is
 * itself an object is carried by REFERENCE. Put a bag inside a bag and the inner
 * one is still yours — unfrozen, and with whatever keys you gave it. That means
 * `Object.assign({}, state.search.inner)` can still swap a prototype and
 * `JSON.stringify(getState())` can still carry the name, one level down. Copying
 * deeper would put an unbounded walk on every commit, and the router does not
 * know which of your values are structures and which are opaque handles. That covers the case the rule exists for: a
 * bag from `JSON.parse`, from `history.state`, from a query string an app parsed
 * itself. Entry-point checks cannot deliver even that much, because they read a
 * bag the router does not own and the copy happens later.
 *
 * ⚑ **What is NOT guaranteed, deliberately.** Nothing about a bag that CHANGES
 * while the router reads it — an accessor that rewrites its own object, a Proxy
 * answering differently per trap call. A router cannot defend an application
 * against its own code, and pretending otherwise buys discipline at a dozen
 * sites for a case only the caller can create. That one belongs to whoever
 * handed the bag over, and it is written down rather than defended against.
 *
 * ⚠ The guards below are written WITHOUT reachability arguments: "it cannot get
 * here" is a claim about an object the router does not own, and two such claims
 * have already been wrong. OWNERSHIP is a sound reason to omit a guard;
 * reachability is not.
 *
 * ⚑ **Why the CHANNELS drop it while everything else keeps it.** A bag core
 * hands back with an own `"__proto__"` is a prototype-swap primitive for any
 * consumer that merges it with `Object.assign` or a `for…in` copy — measured
 * from a bare URL, `?__proto__` parses to `null` and `?__proto__=1&__proto__=2`
 * to an array, and the inherited setter accepts both. `state.params` /
 * `state.search` are the most-merged containers the router publishes, so they
 * follow `getAll`'s rule rather than `claim.write`'s. ⚠ The data-preservation
 * argument for carrying it does not survive contact with a consumer either:
 * `Object.assign` drops the key even in the safe string case, so "the user's
 * `?__proto__=1` is kept" holds for exactly one hop.
 *
 * ⚑ A THIRD sound exemption, and the only one besides ownership: the TARGET is
 * `Object.create(null)`. There is no inherited setter to dispatch into, so the
 * key lands as an ordinary own property and no guard is needed on the way in.
 * The dependency store is the live case (`dependenciesStore.ts`,
 * `getDependenciesApi.setAll`) — both copy a caller-owned bag and neither names
 * `UNSAFE_KEY`, deliberately. It is also why `getAll` is this constant's other
 * consumer: the key is admitted on the way IN and withheld on the way OUT,
 * because that door hands back a normal object someone will merge.
 *
 * ⚑ **That last sentence is a RULE, and `getAll` is no longer its only case
 * (#1957).** Every door that hands back a container core built withholds the key
 * — router options (and with them the clone transport, one object), the
 * dependency clone transport, and the two `NavigationOptions` a plugin hook
 * receives that core MINTS. `dropUnsafeKey` (`helpers.ts`) is the one primitive;
 * the table is `tests/functional/handed-out-containers-1957.test.ts` —
 * enumerated door by door rather than derived from a scan, so a door added to a
 * seam it already covers does not appear in it on its own.
 *
 * ⚠ There is a SECOND shape, for the one container core hands out AND reads
 * back by key: the route-meta record is withheld from ENUMERATION instead
 * (`concealUnsafeKey`, `utils/ingest.ts`), because deleting the entry sends
 * core's own read to the inherited accessor and a route named `__proto__` stops
 * re-activating on a param change — measured.
 *
 * ⚠ Four doors stay EXEMPT, each with a measured reason in that table: the two
 * prior owner decisions (`state.context` #1191, a route's custom fields #1788),
 * the PASS-THROUGH where the container is the caller's own object (the un-forced
 * `NavigationOptions` arc), and the internals handle.
 *
 * ⚑ **A PASS-THROUGH is exempt by default and loses that when the door is
 * INTERCEPTABLE (#1986).** Core mints nothing there — on its no-default fast
 * path `forwardState` hands back the caller's own bags, identity intact — so the
 * rule above does not reach it. It is sanitised anyway, because the door is an
 * extension seam whose documented idiom merges the result: core would be handing
 * a swap primitive to a plugin author who followed the instructions. Every LINK
 * of the chain counts as such a hand-out, not only the door — what one
 * interceptor returns is what the next one merges — so the `next` each hop
 * receives is wrapped as well.
 * `withoutUnsafeKey`'s `hasOwn` gate is what makes it affordable — a clean bag
 * comes back by identity, no allocation.
 *
 * ⚠ The sibling arc is NOT sanitised, and the asymmetry is measured rather than
 * stylistic: copying the plain `NavigationOptions` bag reads `reload` and
 * `replace` a SECOND time, below the read that already decided, and
 * `opts-read-once-1817.test.ts` counts exactly those and pins them at one.
 *
 * ⚑ **The internals handle is out of the rule's scope permanently, and it is a
 * fourth sound exemption rather than an unfixed door (#1986).** The rule governs
 * a container core builds TO HAND OUT; that handle hands out core's LIVE stores,
 * which exist for core's own use and would be there with no consumer at all.
 * Three independent reasons, any one sufficient:
 *
 * - Withholding would take the key from the ROUTER, not from a consumer.
 *   `set("__proto__", v)` is a supported call whose `has` / `get` answer, and
 *   `routeCustomFields` is keyed by ROUTE NAME, where core accepts a route named
 *   `__proto__` (#1801) — so the "poison" is that route's real config.
 * - The pairing already exists and is the shape the rule prescribes: the key is
 *   admitted on the way IN (the destination is `Object.create(null)`, the third
 *   sound exemption above) and withheld on the way OUT, by `getAll`. The handle
 *   is not a way out.
 * - A holder of the handle writes into that live state directly, so protecting
 *   them from a prototype swap on merge is not a coherent goal.
 *
 * Closing it would take a NEW door (a copying `snapshot()`, leaving the handle
 * for core) — new public surface for one key — rather than a withholding.
 */
export const UNSAFE_KEY = "__proto__";

export const constants: Constants = Object.freeze({
  UNKNOWN_ROUTE,
});

/**
 * Plugin method names.
 * Maps to methods that plugins can implement to hook into router lifecycle.
 */
export const plugins: EventToPluginMap = Object.freeze({
  ROUTER_START: "onStart", // Plugin method called when router starts
  ROUTER_STOP: "onStop", // Plugin method called when router stops
  TRANSITION_START: "onTransitionStart", // Plugin method called when navigation begins
  TRANSITION_LEAVE_APPROVE: "onTransitionLeaveApprove", // Plugin method called when deactivation guards pass
  TRANSITION_CANCEL: "onTransitionCancel", // Plugin method called when navigation cancelled
  TRANSITION_SUCCESS: "onTransitionSuccess", // Plugin method called when navigation succeeds
  TRANSITION_ERROR: "onTransitionError", // Plugin method called when navigation fails
});

/**
 * Event names for router event system.
 * Used with addEventListener/removeEventListener for reactive subscriptions.
 */
export const events: EventToNameMap = Object.freeze({
  ROUTER_START: "$start", // Emitted when router.start() succeeds
  ROUTER_STOP: "$stop", // Emitted when router.stop() is called
  TRANSITION_START: "$$start", // Emitted when navigation begins
  TRANSITION_LEAVE_APPROVE: "$$leaveApprove", // Emitted when deactivation guards pass
  TRANSITION_CANCEL: "$$cancel", // Emitted when navigation is cancelled
  TRANSITION_SUCCESS: "$$success", // Emitted when navigation completes successfully
  TRANSITION_ERROR: "$$error", // Emitted when navigation fails
});

export const DEFAULT_LIMITS = Object.freeze({
  maxDependencies: 100,
  maxPlugins: 50,
  maxListeners: 10_000,
  warnListeners: 1000,
  maxLifecycleHandlers: 200,
} as const);

export const EMPTY_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Shared frozen empty query bag reused for `State.search` when a navigation
 * carries no query params — the search-channel twin of {@link EMPTY_PARAMS}
 * (RFC-4 M2 / #1548). Lets `makeState` reuse one frozen `{}` (zero transient
 * allocation, #1027) instead of minting an object per query-less state.
 */
export const EMPTY_SEARCH: Readonly<Record<string, never>> = Object.freeze({});

/**
 * Shared frozen empty `NavigationOptions`, substituted by the facade when a
 * caller passes none — the options-channel twin of {@link EMPTY_PARAMS}.
 *
 * ⚑ It lives here rather than in `Router.ts` so the entry door can recognise it
 * by IDENTITY (#1962). `navigate("b")` is the commonest call in the library, and
 * matching this singleton is what keeps the door's cost on it to one comparison
 * instead of a copy nobody asked for.
 */
export const EMPTY_OPTS: Readonly<Record<string, never>> = Object.freeze({});

const FROZEN_EMPTY_SEGMENTS = Object.freeze({
  deactivated: Object.freeze([]) as unknown as string[],
  activated: Object.freeze([]) as unknown as string[],
  intersection: "",
});

export const DEFAULT_TRANSITION = Object.freeze({
  phase: "activating",
  reason: "success",
  segments: FROZEN_EMPTY_SEGMENTS,
}) as TransitionMeta;

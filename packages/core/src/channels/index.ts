// packages/core/src/channels/index.ts

/**
 * **Channel correctness — one rule, three mechanisms, one directory.**
 *
 * Core's fifth always-on invariant guard lives here (`guard`), together with the
 * two mechanisms that apply the same rule at other moments: `defaults` at
 * registration, `modeGate` at the pipeline's terminal. Only the first is a
 * guard — see the three bullets at the end for what separates them — so "guard"
 * names one of the three, not the directory.
 *
 * `params` is the path channel, `search` the query channel, and the router moves
 * nothing between them: the two meet in exactly one place, the printed URL. This
 * directory owns every mechanism that enforces or applies that, and it is
 * deliberately ONE place — the rule used to live in two files both called
 * `helpers.ts` (the bag check in `src/helpers.ts`, the config check in
 * `namespaces/RoutesNamespace/helpers.ts`), which is one edit away from becoming
 * two rules that disagree.
 *
 * That is not a hypothetical fear; the same shape one layer up is what Phase 4
 * closed. Stage ③ and the mode gate had TWO terminals — `pipeline/canonicalize`
 * and `StateNamespace.makeState` — and #1584's existence precondition landed on
 * the first and not the second, because it was found by sweeping the PORT's
 * consumers while the other terminal read its own dependency bag. One
 * implementation is what makes the next such fix reach every position by
 * construction rather than by whoever remembers the second copy.
 *
 * Why a subsystem and not a namespace method: the other four always-on guards
 * each have an owning module — `subscribe` belongs to `EventBusNamespace`,
 * `start(path)` to `RouterLifecycleNamespace`, `navigateToNotFound` to the
 * facade, `claimContextNamespace` to `getPluginApi`. This one has no owner, and
 * its callers are more numerous than they look — twelve sites in seven modules,
 * counted rather than recalled: P1's raw-argument guard (`internals.ts`), the
 * `forwardState` seam and `canNavigateTo` (`Router.ts`), P3's `navigateToState`
 * (`NavigationNamespace.ts`, twice — the predicate and the message, the one
 * position that answers instead of throwing), the `decodeParams` boundary
 * (`RoutesNamespace.ts`), `updateRoute`'s incoming `defaultParams`
 * (`routesStore.ts`), and four registration entry points (`routesStore.ts` ×2,
 * `getRoutesApi.ts` ×2) reached through the adapter in
 * `RoutesNamespace/helpers.ts`. A cross-cutting invariant with that spread is a
 * subsystem; putting it in a file named "helpers" is what let it drift.
 *
 * **This directory imports nothing from the namespaces, the engine or the
 * pipeline** — the same inversion `src/pipeline` makes with its `RouteResolver`
 * port. Declared query names arrive as DATA (`readonly string[]`, or a
 * `queryNamesOf` accessor), never as a matcher, so there is exactly one registry
 * (#1556) and this code cannot grow a second derivation of it.
 *
 * Three mechanisms, deliberately different in what they do — see the render-path
 * table in `packages/core/CLAUDE.md` before changing any of them:
 *
 * - `guard` — DETECTS and refuses, never moves (#1572). Its THROWING form
 *   (`assertChannelCorrect`) never runs on the predicates: there it would scan
 *   the caller's bag on every `<Link>` render for a condition that is almost
 *   always absent, and its reaction is a throw — into a render, across six
 *   adapters. The bare predicate is another matter and the distinction is
 *   load-bearing (#1581): `canNavigateTo` (`Router.ts`) calls
 *   `findMisChanneledKey` directly and ANSWERS `false` for the shape P1 throws
 *   on, so it never promises a navigation that would throw on the click (#1576).
 *   Detecting on the render path is fine; throwing there is not.
 * - `defaults` — the config-time half of the same guard (a route's own
 *   `defaultParams` naming a key it declares with `?`, refused at registration)
 *   plus the precedence rule that keeps a caller's value ahead of a query
 *   default in the literal form.
 * - `modeGate` — FIXES and never reports (#1575). Runs at the pipeline's single
 *   terminal, for every producer including the predicates, because it speaks
 *   only when a key was actually dropped.
 */

export {
  assertChannelCorrect,
  findMisChanneledKey,
  misChanneledKeyMessage,
} from "./guard";

export { assertRouteDefaultChannels, withholdFilledSlots } from "./defaults";

export { admittedSearch } from "./modeGate";

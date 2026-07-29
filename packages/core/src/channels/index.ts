// packages/core/src/channels/index.ts

/**
 * **Channel correctness — the router's fifth always-on invariant guard, as a
 * subsystem rather than a helper.**
 *
 * `params` is the path channel, `search` the query channel, and the router moves
 * nothing between them: the two meet in exactly one place, the printed URL. This
 * directory owns every mechanism that enforces or applies that, and it is
 * deliberately ONE place — the rule used to live in two files both called
 * `helpers.ts` (the bag check in `src/helpers.ts`, the config check in
 * `namespaces/RoutesNamespace/helpers.ts`), which is how #1584's existence
 * precondition came to land on one half and not the other.
 *
 * Why a subsystem and not a namespace method: the other four always-on guards
 * each have an owning module — `subscribe` belongs to `EventBusNamespace`,
 * `start(path)` to `RouterLifecycleNamespace`, `navigateToNotFound` to the
 * facade, `claimContextNamespace` to `getPluginApi`. This one has no owner: it
 * runs from the facade, from `internals`, from the `forwardState` seam, from the
 * `decodeParams` boundary, from `updateRoute` and from four registration entry
 * points. A cross-cutting invariant with five callers in four modules is a
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
 * - `guard` — DETECTS and refuses, never moves (#1572). Never runs on the
 *   predicates: it scans the caller's bag on every `<Link>` render for a
 *   condition that is almost always absent, and its reaction is a throw.
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

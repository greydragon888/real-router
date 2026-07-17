import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Suspense } from "solid-js";

import { MATCH_MARKER, NOT_FOUND_MARKER, SELF_MARKER } from "./components";

import type {
  MatchMarker,
  NotFoundMarker,
  RouteViewMarker,
  SelfMarker,
} from "./components";
import type { JSX } from "solid-js";

export function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

// §8.1 audit fix (LOW #9) — three isXxxMarker functions had identical
// structure differing only by the Symbol checked. `isMarker` parameterizes
// the check; the three specialized helpers stay as named exports for
// readability and TypeScript narrowing, but delegate through one body.
function isMarker<M extends { $$type: symbol }>(
  value: unknown,
  marker: M["$$type"],
): value is M {
  return (
    value != null &&
    typeof value === "object" &&
    "$$type" in value &&
    value.$$type === marker
  );
}

function isMatchMarker(value: unknown): value is MatchMarker {
  return isMarker<MatchMarker>(value, MATCH_MARKER);
}

function isSelfMarker(value: unknown): value is SelfMarker {
  return isMarker<SelfMarker>(value, SELF_MARKER);
}

function isNotFoundMarker(value: unknown): value is NotFoundMarker {
  return isMarker<NotFoundMarker>(value, NOT_FOUND_MARKER);
}

export function collectElements(
  children: unknown,
  result: RouteViewMarker[],
): void {
  if (children == null) {
    return;
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      collectElements(child, result);
    }

    return;
  }

  if (
    isMatchMarker(children) ||
    isSelfMarker(children) ||
    isNotFoundMarker(children)
  ) {
    result.push(children);
  }
}

// child.children is a getter — read it INSIDE the JSX expression so Solid
// creates a reactive dependency. Pulling it into a variable freezes the
// value at template-build time and breaks Suspense fallback transitions
// (lazy() resolution).
function renderMatch(child: MatchMarker): JSX.Element {
  return child.fallback === undefined ? (
    child.children
  ) : (
    <Suspense fallback={child.fallback}>{child.children}</Suspense>
  );
}

function renderSelf(self: SelfMarker): JSX.Element {
  return self.fallback === undefined ? (
    self.children
  ) : (
    <Suspense fallback={self.fallback}>{self.children}</Suspense>
  );
}

// Sprint G (audit-8 §8b HIGH #4) — pre-computed candidate cache.
// `pickWinner` runs per navigation × N RouteView mounted; the hot inner
// loop matches Match markers against the active route. Before Sprint G,
// that match path went through `isSegmentMatch` (and `startsWithSegment`
// from route-utils) per marker — string compare, startsWith, dot-boundary
// check. Now we pre-compute a Set of `fullSegmentName` values that COULD
// match the current routeName (either exact or as a dot-bounded prefix)
// and reduce the per-marker match to a `Set.has` + one equality check.
//
// Cache key: `routeName` alone (#1094). The lookup content is a pure
// function of routeName — `exactCandidate` IS routeName and
// `prefixCandidates` are its dot-bounded ancestors — so `nodeName` never
// affected the value. Keying by `(routeName, nodeName)` made every distinct
// RouteView in a deep chain miss the cache and rebuild an identical Set,
// i.e. O(depth²) substring builds per navigation.
//
// Cache scope: module-scoped Map. Routes change on every navigation, but the
// active `routeName` is stable for the duration of one navigation × N
// RouteView mounted, so all mounted nodes now share a single entry. The
// cache is bounded by the number of distinct route names in the application,
// so we keep an unbounded Map with no eviction policy. If profiling shows
// it's a memory hot-spot, switch to a small LRU.
interface CandidateLookup {
  exactCandidate: string;
  prefixCandidates: Set<string>;
}

const CANDIDATE_CACHE = new Map<string, CandidateLookup>();

function getCandidateLookup(routeName: string): CandidateLookup {
  const cached = CANDIDATE_CACHE.get(routeName);

  if (cached !== undefined) {
    return cached;
  }

  // Prefix candidates: every dot-bounded ancestor of `routeName`,
  // INCLUDING routeName itself. For routeName = "a.b.c":
  //   { "a.b.c", "a.b", "a" }
  // Empty routeName → empty set (no prefix match possible).
  const prefixCandidates = new Set<string>();

  let cursor = routeName;

  while (cursor) {
    prefixCandidates.add(cursor);
    const lastDot = cursor.lastIndexOf(".");

    if (lastDot === -1) {
      break;
    }

    cursor = cursor.slice(0, lastDot);
  }

  const entry: CandidateLookup = {
    exactCandidate: routeName,
    prefixCandidates,
  };

  CANDIDATE_CACHE.set(routeName, entry);

  return entry;
}

function matchesCandidates(
  child: MatchMarker,
  candidates: CandidateLookup,
  nodeName: string,
): boolean {
  const { segment, exact } = child;

  // audit-2026-05-17 §5 MEDIUM (Sprint A.2) — empty-segment guard.
  // `<Match segment="">` produces a malformed `fullSegmentName`:
  //   - empty nodeName → `""` (never appears in prefixCandidates — see
  //     getCandidateLookup; the while loop's `while (cursor)` skips empty
  //     values)
  //   - non-empty nodeName → `"nodeName."` (trailing dot) — also never
  //     appears in prefixCandidates by construction.
  // Either way the Set.has check below returns false, but checking segment
  // first short-circuits before string concatenation.
  if (!segment) {
    return false;
  }

  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;

  return exact
    ? fullSegmentName === candidates.exactCandidate
    : candidates.prefixCandidates.has(fullSegmentName);
}

// Winner-keyed pipeline (#1094).
//
// `pickWinner` selects the winning MARKER without materializing
// `marker.children`; `materializeWinner` evaluates the children exactly
// once. `RouteViewRoot` keys a `createMemo` on the winner via `winnersEqual`
// (kind + marker identity), so a node-signal fire that leaves the winner
// unchanged does NOT re-materialize — the active subtree is preserved across
// in-winner navigations (parity with the React/Vue adapters) instead of the
// dispose+recreate the previous `<Show>/<For>` + per-fire `renderMatch`
// pipeline paid on every navigation.
//
// Precedence is unchanged (locked by `tests/property/routeView.properties.ts`,
// 35+ PBT): Match first-matching-wins > Self first-wins (only when
// `routeName === nodeName`) > NotFound first-wins (only when
// `routeName === UNKNOWN_ROUTE`). Self/NotFound accumulate independently of
// Match, so their position relative to Match markers cannot change the
// verdict — only the order of Match markers among themselves matters.
export interface RouteViewWinner {
  kind: "match" | "self" | "notFound";
  marker: RouteViewMarker;
}

export function pickWinner(
  elements: RouteViewMarker[],
  routeName: string,
  nodeName: string,
): RouteViewWinner | null {
  const candidates = getCandidateLookup(routeName);

  let selfMarker: SelfMarker | null = null;
  let notFoundMarker: NotFoundMarker | null = null;
  let matchWinner: MatchMarker | null = null;

  for (const child of elements) {
    if (isNotFoundMarker(child)) {
      notFoundMarker ??= child; // first-wins (#1439)
    } else if (isSelfMarker(child)) {
      selfMarker ??= child; // first-wins
    } else if (
      matchWinner === null &&
      matchesCandidates(child, candidates, nodeName)
    ) {
      matchWinner = child; // first MATCHING Match wins
    }
  }

  if (matchWinner !== null) {
    return { kind: "match", marker: matchWinner };
  }

  if (selfMarker !== null && routeName === nodeName) {
    return { kind: "self", marker: selfMarker };
  }

  if (routeName === UNKNOWN_ROUTE && notFoundMarker !== null) {
    return { kind: "notFound", marker: notFoundMarker };
  }

  return null;
}

export function materializeWinner(winner: RouteViewWinner): JSX.Element {
  if (winner.kind === "match") {
    return renderMatch(winner.marker as MatchMarker);
  }

  if (winner.kind === "self") {
    return renderSelf(winner.marker as SelfMarker);
  }

  return (winner.marker as NotFoundMarker).children;
}

export function winnersEqual(
  prev: RouteViewWinner | null,
  next: RouteViewWinner | null,
): boolean {
  if (prev === null || next === null) {
    return prev === next;
  }

  return prev.kind === next.kind && prev.marker === next.marker;
}

// Trie insertion + walking: the recursive `insertIntoTrieFrom` fork engine, slash-child
// insertion, per-segment `processSegment`, and the `walkTrie` lookups. Builds the
// segment trie from the node builders in `./trieNodes`.

import {
  createSegmentNode,
  EMPTY_STATIC_CHILDREN,
  normalizeTrailingSlash,
} from "../pathUtils";
import {
  throwDuplicateRoutePath,
  throwNonAsciiStatic,
  throwSlashChildUnderDynamicParent,
} from "./errors";
import {
  ensureParamChild,
  ensureSplatChild,
  extractParamName,
  markConstrainedParamFork,
  markOptionalFork,
} from "./trieNodes";

import type { CompiledRoute, SegmentNode } from "../types";
import type { RegistrationState } from "./context";

/**
 * #1153: writes a STRONG (full-insertion) terminal route, rejecting a second strong
 * write by a DIFFERENT route — two routes compiling to the same effective path
 * (flat vs nested `/a/b`, or `/x` vs `/x/`), where the later would silently shadow
 * the earlier (its deep link would resolve to the other route). A revisit by the
 * SAME route (the optional-omit fan-out) is idempotent, and a WEAK (omit `??=`)
 * owner is legitimately displaced by a strong write — neither throws.
 */
function writeStrongRoute(node: SegmentNode, compiled: CompiledRoute): void {
  if (
    node.route !== undefined &&
    node.route !== compiled &&
    node.routeIsStrong === true
  ) {
    throwDuplicateRoutePath(node.route.name, compiled.name);
  }

  node.route = compiled;
  node.routeIsStrong = true;
}

/**
 * #1154: whether a STATIC segment carries a code point outside ASCII (≥ U+0080).
 * A raw non-ASCII static (`café`) registers but never matches — match rejects
 * non-ASCII input and compares static keys raw. A per-code-point scan (`for…of`
 * iterates by code point, so surrogate pairs are handled).
 */
function hasNonAsciiSegment(segment: string): boolean {
  // #1285: charCodeAt (code UNIT) index loop, not for-of code points. For a
  // "has non-ASCII" predicate the result is identical — any surrogate (≥ 0xD800) is
  // itself ≥ 0x80, so an astral char is still flagged — without the iterator +
  // code-point decoding cost per static segment of every registered route.
  for (let i = 0; i < segment.length; i++) {
    // eslint-disable-next-line unicorn/prefer-code-point -- charCodeAt (code unit) is intentional: a "has non-ASCII" test needs only units (a surrogate is itself >= 0x80), and it skips the code-point decoding that codePointAt does per index (#1285)
    if (segment.charCodeAt(i) >= 0x80) {
      return true;
    }
  }

  return false;
}

export function insertIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  fullPath: string,
): void {
  const normalized = normalizeTrailingSlash(fullPath);

  if (normalized === "/") {
    writeStrongRoute(state.root, compiled);

    return;
  }

  // Nodes whose param/splat child is created during THIS route's insertion.
  // Lets the conflict guard distinguish a route revisiting its own slot (the
  // optional-omit branch) from a genuine cross-route collision (#736).
  const ownNodes = new Set<SegmentNode>();

  // Visited (node, start) pairs for THIS insertion — collapses the take/skip
  // fan-out of consecutive optional params from O(2^N) to polynomial (#849).
  const visited = new Map<SegmentNode, Set<number>>();

  insertIntoTrieFrom(
    state,
    state.root,
    normalized,
    1,
    compiled,
    ownNodes,
    visited,
  );
}

function insertIntoTrieFrom(
  state: RegistrationState,
  node: SegmentNode,
  path: string,
  start: number,
  compiled: CompiledRoute,
  ownNodes: Set<SegmentNode>,
  visited: Map<SegmentNode, Set<number>>,
): void {
  // #849: each optional param forks this function into a "take" and a "skip"
  // branch, and those branches converge on the same (node, start) pairs across
  // consecutive optionals — without memoization that is O(2^N) work for N
  // optionals (the trie stays small; only the work explodes). Inserting from a
  // given (node, start) is deterministic for a fixed (path, compiled), and the
  // only side effects (ensureParamChild returning an existing child,
  // `node.route ??=`/`=` with the same compiled) are idempotent, so a revisit is
  // pure redundancy — record the entry and skip repeats. This collapses the
  // fan-out to O(distinct (node, start) pairs).
  let seenStarts = visited.get(node);

  if (seenStarts === undefined) {
    seenStarts = new Set<number>();
    visited.set(node, seenStarts);
  } else if (seenStarts.has(start)) {
    return;
  }

  seenStarts.add(start);

  const length = path.length;

  while (start <= length) {
    const end = path.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;
    const segment = path.slice(start, segmentEnd);

    if (segment.endsWith("?")) {
      // Optional param fork. An optional SPLAT (`*name?`, #1149) was already
      // rejected by registerNode's per-segment grammar pass, so a `?`-suffixed
      // segment reaching here is always an optional param.
      const paramName = extractParamName(segment);
      const paramChildNode = ensureParamChild(node, paramName, ownNodes);

      // Path with param: continue recursively from paramChild
      insertIntoTrieFrom(
        state,
        paramChildNode,
        path,
        segmentEnd + 1,
        compiled,
        ownNodes,
        visited,
      );

      // Path without param: skip this segment and continue from node
      if (segmentEnd >= length) {
        node.route ??= compiled;
      } else {
        insertIntoTrieFrom(
          state,
          node,
          path,
          segmentEnd + 1,
          compiled,
          ownNodes,
          visited,
        );
      }

      // #1263/#1264: mark this optional's paramChild as a fork so `match` can
      // disambiguate the omit form (opt→splat via constraint, opt→param via the
      // successor's name).
      markOptionalFork(node, compiled, paramName, path, segmentEnd, length);

      return;
    }

    const parent = node;

    node = processSegment(state, node, segment, ownNodes);
    // #1266: mark a CONSTRAINED required param as a try-take-if-valid fork so `match`
    // can fall to a splat sibling when the constraint fails, instead of greedily
    // committing and dying post-traverse.
    markConstrainedParamFork(parent, compiled, segment);
    start = segmentEnd + 1;
  }

  writeStrongRoute(node, compiled);
}

export function insertSlashChildIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  parentPath: string,
): void {
  // #1242 §5.4 + #1294: an index route (path "/") under a parent whose path carries an
  // OPTIONAL param in ANY position, or ends in a SPLAT, is unreachable/inconsistent.
  // Under an optional the index binds only the take form (`/a/:b?/c` + idx: `/a/x/c/` →
  // index, `/a/c/` → parent) — `walkTrie` lands `slashChildRoute` on the full-take
  // terminal only and does not fan out omit forms; under a splat `slashChildRoute` sits
  // on the splat node, which `#matchSplat`'s fast path never reads, so the index is
  // unreachable entirely. #1242 checked only the LAST segment, missing mid-path
  // optionals (#1294). A REQUIRED-param parent (`/users/:id`, `/a/:b/c`) has a single
  // form and its slash-child is coherent (existing behaviour) — allowed. parentPath is
  // constraint-stripped (walkTrie requires it), so "/" is a clean segment separator.
  const lastSegment = parentPath.slice(parentPath.lastIndexOf("/") + 1);
  const optionalParamParent = parentPath
    .split("/")
    .some((segment) => segment.startsWith(":") && segment.endsWith("?"));
  const splatParent = lastSegment.startsWith("*");

  if (optionalParamParent || splatParent) {
    throwSlashChildUnderDynamicParent(compiled.name, parentPath);
  }

  const node = walkTrie(state, parentPath);

  node.slashChildRoute = compiled;
}

function walkTrie(state: RegistrationState, fullPath: string): SegmentNode {
  return walkTrieFrom(state, state.root, fullPath);
}

function walkTrieFrom(
  state: RegistrationState,
  startNode: SegmentNode,
  path: string,
): SegmentNode {
  const normalized = normalizeTrailingSlash(path);

  /* v8 ignore start -- defensive: slash-child always passes valid path */
  if (normalized === "/" || normalized === "") {
    return startNode;
  }
  /* v8 ignore stop */

  let node = startNode;
  let start = 1;
  const length = normalized.length;

  // Slash-child re-walks an already-inserted path of the same route family —
  // names always match, so the conflict guard never fires; a throwaway set
  // keeps the shared `processSegment` signature satisfied.
  const ownNodes = new Set<SegmentNode>();

  while (start <= length) {
    const end = normalized.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;

    /* v8 ignore start -- defensive: indexOf always returns valid index for non-empty segments */
    if (segmentEnd <= start) {
      break;
    }
    /* v8 ignore stop */

    const segment = normalized.slice(start, segmentEnd);

    node = processSegment(state, node, segment, ownNodes);
    start = segmentEnd + 1;
  }

  return node;
}

function processSegment(
  state: RegistrationState,
  node: SegmentNode,
  segment: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (segment.startsWith("*")) {
    // extractParamName (via parseSegment) rejects a name-less `*` (#858) AND a
    // trailing marker (`*y:`, #1324) — the splat name shares one boundary with
    // the param branch, the optional fork, and the route-tree gate.
    const splatName = extractParamName(segment);
    const child = ensureSplatChild(node, splatName, ownNodes);

    // Stryker disable next-line BooleanLiteral: equivalent — sets hasChildren on the node ACQUIRING a splat child; only a splat NODE's own hasChildren is read (in #matchSplat), and splat-of-splat is unreachable (splat is terminal-greedy). Proven by injection.
    node.hasChildren = true;

    return child;
  }

  if (segment.startsWith(":")) {
    const paramName = extractParamName(segment);
    const child = ensureParamChild(node, paramName, ownNodes);

    node.hasChildren = true;

    return child;
  }

  // The segment does not start with a marker, so it compiles as a static literal.
  // A `:`/`*` fused to a static prefix within it (`a:b`, `x:id`, `a*b`, #1050) was
  // already rejected by the per-segment grammar pass in `registerNode` — a
  // fused-marker segment never reaches this literal compilation.

  // #1154: a raw non-ASCII code point in a STATIC segment (`/café`, `/меню`).
  // match rejects any input byte ≥ 0x80 (`#scanPath`) AND compares static trie
  // keys raw (never percent-decoded), so such a route registers but is
  // unmatchable — `buildPath` emits `/café`, which its own `match` rejects (a dead
  // route). Reject at registration with the percent-encode workaround. A non-ASCII
  // PARAM name or constraint is unaffected (only static text is compared raw).
  if (hasNonAsciiSegment(segment)) {
    throwNonAsciiStatic(segment);
  }

  const key = state.options.caseSensitive ? segment : segment.toLowerCase();

  if (!(key in node.staticChildren)) {
    // Copy-on-write off the shared frozen EMPTY_STATIC_CHILDREN sentinel: the
    // first static child this node gains earns it a fresh mutable null-proto map.
    if (node.staticChildren === EMPTY_STATIC_CHILDREN) {
      node.staticChildren = Object.create(null) as Record<string, SegmentNode>;
    }

    node.staticChildren[key] = createSegmentNode();
    node.hasChildren = true;
  }

  return node.staticChildren[key];
}

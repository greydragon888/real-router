// Trie insertion + walking: the recursive `insertIntoTrieFrom` linear walk, slash-child
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
} from "./trieNodes";

import type { CompiledRoute, SegmentNode } from "../types";
import type { RegistrationState } from "./context";

/**
 * #1153: writes a terminal route, rejecting a second write by a DIFFERENT route —
 * two routes compiling to the same effective path (flat vs nested `/a/b`, or `/x`
 * vs `/x/`), where the later would silently shadow the earlier (its deep link
 * would resolve to the other route). A revisit by the SAME route is idempotent.
 * (With the 3-token grammar every terminal write is a full insertion — the former
 * WEAK optional-omit `??=` writes are gone with optional params.)
 */
function writeTerminalRoute(node: SegmentNode, compiled: CompiledRoute): void {
  if (node.route !== undefined && node.route !== compiled) {
    throwDuplicateRoutePath(node.route.name, compiled.name);
  }

  node.route = compiled;
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
    writeTerminalRoute(state.root, compiled);

    return;
  }

  insertIntoTrieFrom(state, state.root, normalized, 1, compiled);
}

function insertIntoTrieFrom(
  state: RegistrationState,
  node: SegmentNode,
  path: string,
  start: number,
  compiled: CompiledRoute,
): void {
  const length = path.length;

  // 3-token grammar (M1): every segment is `static | :param | *splat` — a single
  // linear walk down the trie (no optional take/skip fork, so no `visited` memo,
  // and — since a route never revisits a slot it created — no #736 `ownNodes` set).
  while (start <= length) {
    const end = path.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;
    const segment = path.slice(start, segmentEnd);

    node = processSegment(state, node, segment);
    start = segmentEnd + 1;
  }

  writeTerminalRoute(node, compiled);
}

export function insertSlashChildIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  parentPath: string,
): void {
  // #1242 §5.4: an index route (path "/") under a parent whose path ends in a
  // SPLAT is unreachable — `slashChildRoute` sits on the splat node, which
  // `#matchSplat`'s fast path never reads. A REQUIRED-param parent (`/users/:id`,
  // `/a/:b/c`) has a single form and its slash-child is coherent (existing
  // behaviour) — allowed. (The former OPTIONAL-param arm, #1294, is gone with
  // optional params — M1.)
  const lastSegment = parentPath.slice(parentPath.lastIndexOf("/") + 1);

  if (lastSegment.startsWith("*")) {
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
  // names always match, so the conflict guard never fires.

  while (start <= length) {
    const end = normalized.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;

    /* v8 ignore start -- defensive: indexOf always returns valid index for non-empty segments */
    if (segmentEnd <= start) {
      break;
    }
    /* v8 ignore stop */

    const segment = normalized.slice(start, segmentEnd);

    node = processSegment(state, node, segment);
    start = segmentEnd + 1;
  }

  return node;
}

function processSegment(
  state: RegistrationState,
  node: SegmentNode,
  segment: string,
): SegmentNode {
  if (segment.startsWith("*")) {
    // extractParamName (via parseSegment) rejects a name-less `*` (#858) AND a
    // trailing marker (`*y:`, #1324) — the splat name shares one boundary with
    // the param branch and the route-tree gate.
    const splatName = extractParamName(segment);
    const child = ensureSplatChild(node, splatName);

    // Stryker disable next-line BooleanLiteral: equivalent — sets hasChildren on the node ACQUIRING a splat child; only a splat NODE's own hasChildren is read (in #matchSplat), and splat-of-splat is unreachable (splat is terminal-greedy). Proven by injection.
    node.hasChildren = true;

    return child;
  }

  if (segment.startsWith(":")) {
    const paramName = extractParamName(segment);
    const child = ensureParamChild(node, paramName);

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

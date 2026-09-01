// Trie insertion + walking: the recursive `insertIntoTrieFrom` linear walk, slash-child
// insertion, per-segment `processSegment`, and the `walkTrie` lookups. Builds the
// segment trie from the node builders in `./trieNodes`.

import { parseSegment } from "../parseSegment";
import {
  createSegmentNode,
  EMPTY_STATIC_CHILDREN,
  normalizeTrailingSlash,
} from "../pathUtils";
import {
  throwDuplicateRoutePath,
  throwEmptyParamName,
  throwNonAsciiStatic,
  throwIndexUnderSplatParent,
} from "./errors";
import { ensureParamChild, ensureSplatChild } from "./trieNodes";

import type { CompiledRoute, SegmentNode } from "../types";
import type { RegistrationState } from "./context";

/** `/` — the trailing-slash scan in `insertSlashChildIntoTrie`. */
const SLASH = 47;

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
  // ⚑ NORMALISED, and that is the fix rather than a tidy-up (#1996). The guard
  // must read the same string the walk walks: `walkTrieFrom` below normalises
  // the trailing slash, and `registerSlashChild` normalises again one line after
  // calling us, for the cache key. Reading the RAW path made this the one
  // consumer of three that did not — and for `"/files/*rest/"` the slice yields
  // `""`, so the guard fell silent, the route registered, and the root splat
  // became the FINAL segment of the build path (a build slot the finality rule
  // in `buildParts.ts` would otherwise have dropped). Measured on the tree that
  // then registered: `buildPath` demanded a param the route never declared, and
  // `matchPath` refused the URL that param produced.
  //
  // ⚠ Tokenising the segment instead does NOT close it, measured rather than
  // reasoned: `parseSegment("")` answers `{ kind: "static" }` and
  // `"".startsWith("*")` is `false`, so the two spellings AGREE here. They part
  // only on a malformed splat (`*`, `*y:`), which the grammar pass refuses
  // before this guard is reached.
  // ⚠ EVERY trailing slash, not one. `normalizeTrailingSlash` strips exactly
  // one, and `"/app/*rest//"` survived the first version of this fix for that
  // reason. ⚑ That doubled tail is no longer CONSTRUCTIBLE — since #2010 the
  // matcher backstop refuses a `//` in a declared path, measured through both
  // doors (`createRouter` and `setRootPath`); a single `*rest/` still
  // registers, which is the shape this guard is really for. The loop stays as
  // a backstop rather than being narrowed to one slash: a path ending in
  // `*rest//` still ENDS IN A SPLAT, which is the only question asked here.
  //
  // ⚑ The `> 1` floor mirrors `normalizeTrailingSlash`'s own, and it is NOT
  // verdict-bearing here — measured, `> 0` leaves the whole suite green, because
  // a path of nothing but slashes yields an empty last segment either way and an
  // empty segment is not a splat. It stays because stopping at index 1 is what
  // the sibling helper does, not because a test would catch its removal.
  let end = parentPath.length;

  while (end > 1 && parentPath.codePointAt(end - 1) === SLASH) {
    end -= 1;
  }

  const normalizedParent = parentPath.slice(0, end);
  const lastSegment = normalizedParent.slice(
    normalizedParent.lastIndexOf("/") + 1,
  );

  if (lastSegment.startsWith("*")) {
    // The message keeps the caller's own spelling — that is what they wrote.
    throwIndexUnderSplatParent(compiled.name, parentPath);
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
  // ⚑ The TOKENIZER decides what this segment is, not its leading character
  // (#1998). This was the last site in `path-matcher` where "is it a splat"
  // was spelled twice — and the class had already produced two measured
  // defects: #1975 (`makeBuildParamSlot` derived splat-ness from a set of
  // NAMES, which the finality rule filtered differently — a silent wrong URL)
  // and #1996 one function above (the marker read off a sliced raw path, which
  // a trailing slash defeated).
  //
  // ⚑ It also removes a parse rather than adding one. The name-extracting
  // wrapper this replaces called `parseSegment` a SECOND time on a segment whose
  // kind `startsWith` had just decided; asking the tokenizer once answers both.
  // Measured on registration of a 60×4 tree — 0.586 / 0.575 ms against a
  // 0.591 / 0.614 ms baseline, inside the A/A spread. A static segment is parsed
  // where it was not, and it does not show.
  const token = parseSegment(segment);

  // `registerNode`'s per-segment grammar pass rejects every malformed segment
  // before trie insertion, so only `static | :param | *splat` reach here. Kept
  // as a typed backstop — the wrapper's own guard, inlined with it, minus its
  // `static` arm: static is a legitimate branch below rather than an error, once
  // the kind is ASKED instead of assumed from a leading character.
  /* v8 ignore start -- unreachable: registerNode's grammar pass rejects non-name segments first */
  if ("error" in token) {
    throwEmptyParamName();
  }
  /* v8 ignore stop */

  if (token.kind === "splat") {
    const child = ensureSplatChild(node, token.name);

    // Stryker disable next-line BooleanLiteral: equivalent — sets hasChildren on the node ACQUIRING a splat child; only a splat NODE's own hasChildren is read (in #matchSplat), and splat-of-splat is unreachable (splat is terminal-greedy). Proven by injection.
    node.hasChildren = true;

    return child;
  }

  if (token.kind === "param") {
    const child = ensureParamChild(node, token.name);

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

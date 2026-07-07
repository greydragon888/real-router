// Trie node construction: param-name extraction + the param/splat child creators and
// the optional/constrained fork markers (#736/#1264/#1266/#1288). Consumed by `trie`
// during insertion.

import { parseSegment } from "../parseSegment";
import { createSegmentNode } from "../pathUtils";
import {
  throwEmptyParamName,
  throwParamNameConflict,
  throwUnconstrainedOptionalSplat,
} from "./errors";

import type { CompiledRoute, SegmentNode } from "../types";

/**
 * Extracts the param name from a marker-led segment (`:name` / `:name?` /
 * `*name`), delegating the boundary to the canonical `parseSegment` tokenizer
 * (#1324) so the trie backstop, the route-tree gate, and `buildParamMeta` share
 * ONE grammar and cannot drift. Rejects a name-less marker (#858), the #1324
 * trailing marker (`:y*`/`:y:`), and a `?`-suffixed non-marker segment the
 * optional fork routes here (`faq?` → static → not an optional param, #1241).
 * Single source for the param branch in `processSegment` and the optional fork
 * in `insertIntoTrieFrom`. Called on the constraint-stripped segment, so
 * parseSegment sees only the name + optional marker.
 */
export function extractParamName(segment: string): string {
  const token = parseSegment(segment);

  // registerNode's per-segment grammar pass (Реш.2) rejects every malformed segment
  // — name-less (#858), trailing-marker (#1324), fused-marker (#1050), constraint
  // forms — before trie insertion, so a param|splat name is guaranteed here. The
  // error/`static` branches are unreachable, kept as a typed defensive backstop.
  /* v8 ignore start -- unreachable: registerNode's grammar pass rejects non-name segments first */
  if ("error" in token || token.kind === "static") {
    throwEmptyParamName();
  }
  /* v8 ignore stop */

  return token.name;
}

/**
 * Returns the param child of `node`, creating it on first use. A pre-existing
 * child with a *different* name is a #736 conflict unless `node` is in
 * `ownNodes` (the current route created this slot — the optional-omit branch).
 */
export function ensureParamChild(
  node: SegmentNode,
  paramName: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (!node.paramChild) {
    // `fork` initialized here (not added conditionally by the optional-fork
    // marker below) so every paramChild shares one hidden class — the fork check
    // in `#traverseFrom` stays monomorphic (~0 hot-path tax, spike Stage 1).
    node.paramChild = {
      node: createSegmentNode(),
      name: paramName,
      fork: undefined,
    };
    ownNodes.add(node);
  } else if (node.paramChild.name !== paramName && !ownNodes.has(node)) {
    throwParamNameConflict(node.paramChild.name, paramName, ":");
  }

  return node.paramChild.node;
}

/**
 * #1263/#1264: marks a `paramChild` created by the optional fork so `match` can
 * disambiguate the omit form. Called ONLY from the optional fork, so a
 * non-optional param+splat sibling (#1266) is untouched.
 *
 * - **A1 opt→splat** (`/:v<c>?/*rest`): a constraint + a splat sibling → mark the
 *   constraint (try-take-if-valid). An unconstrained optional→splat is rejected
 *   at registration (reject-with-hint), so a splat fork always carries one.
 * - **A2 opt→required-param** (`/:a?/:b`): the successor is a required param →
 *   mark its name (`skipName`), bound on the omit form. Constraints are stripped
 *   from `path` before trie insertion, so the successor segment is `:b` and its
 *   own constraint (if any) is validated post-traverse via `constraintPatterns`.
 */
export function markOptionalFork(
  node: SegmentNode,
  compiled: CompiledRoute,
  paramName: string,
  path: string,
  segmentEnd: number,
  length: number,
): void {
  const constraintPattern = compiled.constraintPatterns.get(paramName)?.pattern;

  if (node.paramChild && node.splatChild) {
    // opt→splat. Reject-with-hint if UNCONSTRAINED (#1264, product decision): an
    // unconstrained optional before a splat has no validity signal — every
    // multi-segment value has two readings, so `match` would silently reshape
    // half the input space (wrong-name in new clothing). A constraint gives the
    // signal `try-take-if-valid` needs (A1).
    if (constraintPattern === undefined) {
      throwUnconstrainedOptionalSplat(paramName);
    }

    node.paramChild.fork = { constraint: constraintPattern };

    return;
  }

  const nextStart = segmentEnd + 1;

  if (nextStart <= length) {
    const nextEnd = path.indexOf("/", nextStart);
    const nextSegment = path.slice(
      nextStart,
      nextEnd === -1 ? length : nextEnd,
    );

    // A required param (`:b`, not `:b?` — an optional successor is the opt+opt
    // case, present-first, out of this fix's scope).
    if (
      node.paramChild &&
      nextSegment.startsWith(":") &&
      !nextSegment.endsWith("?")
    ) {
      node.paramChild.fork = { skipName: extractParamName(nextSegment) };
    }
  }
}

/**
 * #1266: mark a CONSTRAINED required param sharing its trie level with a splat sibling
 * (cross-route: `/*rest` + `/:v<c>/*rest`) as a try-take-if-valid fork — the same
 * mechanism `markOptionalFork`'s A1 gives the constrained-optional→splat case, but for
 * a REQUIRED param (no `optional` anywhere). Without it the param greedily commits
 * (INVARIANTS #8), its constraint is validated only after the full traverse (#857, no
 * backtrack), and the match returns `undefined` instead of falling to the splat
 * sibling — leaving the catch-all unreachable and its `buildPath` a dead deep-link.
 *
 * Marked UNCONDITIONALLY for every constrained required param — `match` acts on the
 * fork only when a splat sibling is ALSO present at the node (`node.splatChild`), so a
 * constrained param without a splat sibling is unaffected. Unconditional marking is
 * what makes it registration-order independent: the splat sibling may be registered by
 * another route before or after this param, and need not exist at the node yet here.
 * `??=` preserves an optional fork already marked at this position (#1264 wins).
 */
export function markConstrainedParamFork(
  node: SegmentNode,
  compiled: CompiledRoute,
  segment: string,
): void {
  // #1285: short-circuit the whole helper for the common UNCONSTRAINED route (first,
  // cheapest check) before the `extractParamName` regex — the constraint lookup would
  // always miss anyway, and registerTree is ~58% of the SSR clone tax.
  if (
    !compiled.hasConstraints ||
    !segment.startsWith(":") ||
    node.paramChild === undefined
  ) {
    return;
  }

  const constraintPattern = compiled.constraintPatterns.get(
    extractParamName(segment),
  )?.pattern;

  if (constraintPattern === undefined) {
    return;
  }

  const pc = node.paramChild;

  // #1284: one trie slot legally serves several routes with DIFFERENT constraints
  // under the same param name. The fork's validity signal must be the DISJUNCTION —
  // `match` skips to the splat sibling only when EVERY route's constraint fails, else
  // a value matching a LATER route wrongly falls to the splat (killing that route,
  // order-dependent). Composite of the anchored sources → one `.test` at match;
  // post-traverse per-route validation still filters the correct winner. `fork` is
  // re-created (not mutated) since `ForkMeta.constraint` is readonly.
  if (pc.fork?.constraint === undefined) {
    pc.fork = { ...pc.fork, constraint: constraintPattern };
  } else if (pc.fork.constraint.source !== constraintPattern.source) {
    pc.fork = {
      ...pc.fork,
      constraint: new RegExp(
        `(?:${pc.fork.constraint.source})|(?:${constraintPattern.source})`,
        pc.fork.constraint.flags,
      ),
    };
  }
}

/** Splat counterpart of {@link ensureParamChild}. */
export function ensureSplatChild(
  node: SegmentNode,
  splatName: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (!node.splatChild) {
    node.splatChild = { node: createSegmentNode(), name: splatName };
    ownNodes.add(node);
  } else if (node.splatChild.name !== splatName && !ownNodes.has(node)) {
    throwParamNameConflict(node.splatChild.name, splatName, "*");
  }

  return node.splatChild.node;
}

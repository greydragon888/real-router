import type { SegmentNode } from "./types";

// A trie node allocating its own `Object.create(null)` for `staticChildren`
// pays for a V8 dictionary-mode object from birth (~192 B — own map + backing
// store, ~3× a plain `{}`), and the leaf-majority (one node per registered
// route) never gains a static child, so it would hold that empty object purely
// to answer the match-path `key in node.staticChildren` read. Share ONE frozen
// empty null-proto sentinel across every fresh node;
// `processSegment` (registration/trie.ts) copies-on-write — swaps in a fresh
// mutable null-proto object — before the first real write. The frozen shell
// fails loud if a write ever skips that guard. Mirrors the #1009 `EMPTY_*`
// sentinels in `registration/context.ts`.
export const EMPTY_STATIC_CHILDREN: Record<string, SegmentNode> = Object.freeze(
  Object.create(null) as Record<string, SegmentNode>,
);

export function createSegmentNode(): SegmentNode {
  return {
    staticChildren: EMPTY_STATIC_CHILDREN,
    // Stryker disable next-line BooleanLiteral: equivalent — for a leaf splat node the `!hasChildren` fast path and the `#traverseFrom` fallback both set `params[name] = slice` and return `sn.route`; nodes that gain children overwrite this flag during registration. Proven: forcing `true` keeps the full suite green (it only un-covers the now-unreachable fast path).
    hasChildren: false,
    paramChild: undefined,
    splatChild: undefined,
    route: undefined,
    slashChildRoute: undefined,
  };
}

export function normalizeTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

export function buildFullPath(parentPath: string, nodePath: string): string {
  // Stryker disable next-line StringLiteral,BlockStatement: equivalent — empty-operand fast path; `parentPath + nodePath` already yields the identical string when `parentPath === ""`, so emptying the block or never triggering it (sentinel comparand) changes no result. ConditionalExpression stays live (killable `->true` sibling).
  if (parentPath === "") {
    return nodePath;
  }

  // Stryker disable next-line StringLiteral,BlockStatement: equivalent — symmetric empty-operand fast path; `parentPath + nodePath` already equals `parentPath` when `nodePath === ""`. ConditionalExpression stays live (killable `->true` sibling).
  if (nodePath === "") {
    return parentPath;
  }

  // ⚑ ONE separator, not two (#2002). Joined naively, a parent path written
  // with a trailing slash gives every child a full path carrying `//`, and the
  // trie registers the route AT that doubled path — so the child builds a URL
  // its own `matchPath` refuses and the natural URL matches nothing:
  //
  //     { path: "/files/list/", children: [{ path: "/detail" }] }
  //     buildPath("p.c")            -> "/files/list//detail"  (unmatchable)
  //     matchPath("/files/list/detail") -> undefined
  //
  // Ordinary nesting, no splat and no index involved — those were how it was
  // found (#1996's sibling), not its subject.
  //
  // ⚠ Repairing `isSlashChild` instead was measured and does NOT close it: that
  // predicate is not consulted for a non-index child, so ordinary children stay
  // broken. Collapsing here is the only candidate that fixes both.
  // ⚠ The second term is UNKILLABLE today and stays anyway, which is the
  // opposite of an equivalent mutant. `createNode` normalises a node path to a
  // leading `/` before this runs (#1407), so dropping the term leaves the whole
  // suite green — measured. It is load-bearing all the same: `slice(1)` assumes
  // the first character IS the separator, so without the term a slash-less
  // `nodePath` would lose its first character instead. It guards the hazard, not
  // a reachable branch.
  if (parentPath.endsWith("/") && nodePath.startsWith("/")) {
    return parentPath + nodePath.slice(1);
  }

  return parentPath + nodePath;
}

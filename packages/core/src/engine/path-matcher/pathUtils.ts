import type { SegmentNode } from "./types";

// Every trie node used to allocate its own `Object.create(null)` for
// `staticChildren`. A null-proto empty object is V8 dictionary-mode from birth
// (~192 B — own map + backing store, ~3× a plain `{}`), and the leaf-majority
// (one node per registered route) never gains a static child, so it held that
// empty object purely to answer the match-path `key in node.staticChildren`
// read. Share ONE frozen empty null-proto sentinel across every fresh node;
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

  return parentPath + nodePath;
}

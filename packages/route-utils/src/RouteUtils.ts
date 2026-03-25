import { areRoutesRelated } from "./routeRelation.js";
import {
  startsWithSegment,
  endsWithSegment,
  includesSegment,
} from "./segmentTesters.js";

import type { RouteTreeNode, SegmentTestFunction } from "./types.js";

export class RouteUtils {
  // ===== Static facade: segment testing =====

  /**
   * Tests if a route name starts with the given segment.
   * Supports direct calls, curried form, and `State` objects.
   *
   * @see {@link startsWithSegment} standalone function for details
   */
  static readonly startsWithSegment: SegmentTestFunction = startsWithSegment;

  /**
   * Tests if a route name ends with the given segment.
   * Supports direct calls, curried form, and `State` objects.
   *
   * @see {@link endsWithSegment} standalone function for details
   */
  static readonly endsWithSegment: SegmentTestFunction = endsWithSegment;

  /**
   * Tests if a route name includes the given segment anywhere in its path.
   * Supports direct calls, curried form, and `State` objects.
   *
   * @see {@link includesSegment} standalone function for details
   */
  static readonly includesSegment: SegmentTestFunction = includesSegment;

  /**
   * Checks if two routes are related in the hierarchy
   * (same, parent-child, or child-parent).
   *
   * @see {@link areRoutesRelated} standalone function for details
   */
  static readonly areRoutesRelated = areRoutesRelated;

  // ===== Instance fields =====

  readonly #chainCache: Map<string, readonly string[]>;
  readonly #siblingsCache: Map<string, readonly string[]>;

  constructor(root: RouteTreeNode) {
    this.#chainCache = new Map();
    this.#siblingsCache = new Map();
    this.#buildAll(root, []);
  }

  /**
   * Returns cumulative name segments for the given route (ancestor chain without root).
   *
   * All chains are pre-computed and frozen during construction.
   *
   * @param name - Full route name (e.g. `"users.profile"`)
   * @returns Frozen array of cumulative segments, or `undefined` if not in tree
   *
   * @example
   * ```ts
   * utils.getChain("users.profile.edit");
   * // → ["users", "users.profile", "users.profile.edit"]
   * ```
   */
  getChain(name: string): readonly string[] | undefined {
    return this.#chainCache.get(name);
  }

  /**
   * Returns non-absolute siblings of the named node (excluding itself).
   *
   * Siblings are children of the same parent, filtered by `nonAbsoluteChildren`.
   * All siblings are pre-computed and frozen during construction.
   *
   * @param name - Full route name
   * @returns Frozen array of sibling full names, or `undefined` if not found or root
   */
  getSiblings(name: string): readonly string[] | undefined {
    return this.#siblingsCache.get(name);
  }

  /**
   * Checks if `child` is a descendant of `parent` via string prefix comparison.
   *
   * Does not perform tree lookup — O(k) where k is the name length.
   *
   * @param child - Full name of the potential descendant
   * @param parent - Full name of the potential ancestor
   * @returns `true` if `child` starts with `parent.` (dot-separated)
   *
   * @remarks
   * Does not work with root (`""`) as parent — returns `false` because
   * `"users".startsWith(".")` is `false`. This is acceptable since
   * every route in the tree is trivially a descendant of root.
   */
  isDescendantOf(child: string, parent: string): boolean {
    return child !== parent && child.startsWith(`${parent}.`);
  }
  #buildAll(node: RouteTreeNode, chain: string[]): void {
    const { fullName } = node;

    // Build chain: root gets [""], others get cumulative segments
    if (fullName !== "") {
      chain.push(fullName);
    }

    this.#chainCache.set(
      fullName,
      Object.freeze(fullName === "" ? [""] : [...chain]),
    );

    // Build siblings for all children of this node
    // Siblings = nonAbsoluteChildren excluding the child itself
    // Absolute children also get siblings (all nonAbsoluteChildren)
    const nonAbsoluteNames = node.nonAbsoluteChildren.map(
      (child) => child.fullName,
    );

    for (const child of node.nonAbsoluteChildren) {
      this.#siblingsCache.set(
        child.fullName,
        Object.freeze(
          nonAbsoluteNames.filter((name) => name !== child.fullName),
        ),
      );
    }

    // Absolute children: their siblings are ALL nonAbsoluteChildren
    for (const child of node.children.values()) {
      if (!this.#siblingsCache.has(child.fullName) && child.fullName !== "") {
        this.#siblingsCache.set(
          child.fullName,
          Object.freeze([...nonAbsoluteNames]),
        );
      }
    }

    // Recurse into all children (including absolute)
    for (const child of node.children.values()) {
      this.#buildAll(child, chain);
    }

    // Restore chain for sibling traversal
    if (fullName !== "") {
      chain.pop();
    }
  }
}

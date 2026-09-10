import type { RouteTreeNode } from "./types.js";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

export class RouteUtils {
  /**
   * ⚠ **No static facade, and the absence is load-bearing (#2209).** A static
   * field is a reference, so `RouteUtils.endsWithSegment` would retain both
   * unused segment testers for every consumer of this class — and every
   * adapter's `useRouteUtils` is such a consumer. Measured on the built output:
   * the facade path carries them at 1 945 B and drops to 749 B without it.
   *
   * ⚠ A getter is not an escape. Measured: it retains the function just the
   * same and costs more bytes than the field. The API and the shakeability are
   * in direct conflict, so the standalone exports are the whole surface —
   * `startsWithSegment`, `endsWithSegment`, `includesSegment` and
   * `areRoutesRelated` are exported from the package root.
   */

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

    this.#chainCache.set(fullName, freeze(fullName === "" ? [""] : [...chain]));

    // Build siblings for all children of this node
    // Siblings = nonAbsoluteChildren excluding the child itself
    // Absolute children also get siblings (all nonAbsoluteChildren)
    const nonAbsoluteNames = node.nonAbsoluteChildren.map(
      (child) => child.fullName,
    );

    for (const child of node.nonAbsoluteChildren) {
      this.#siblingsCache.set(
        child.fullName,
        freeze(nonAbsoluteNames.filter((name) => name !== child.fullName)),
      );
    }

    // Absolute children: their siblings are ALL nonAbsoluteChildren
    for (const child of node.children.values()) {
      if (!this.#siblingsCache.has(child.fullName) && child.fullName !== "") {
        this.#siblingsCache.set(child.fullName, freeze([...nonAbsoluteNames]));
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

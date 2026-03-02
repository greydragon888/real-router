import type { RouteTree } from "route-tree";

export class RouteUtils {
  readonly #nodeIndex: Map<string, RouteTree>;
  readonly #chainCache: Map<string, readonly RouteTree[]>;
  readonly #nameSegmentsCache: Map<string, readonly string[]>;
  readonly #siblingsCache: Map<string, readonly RouteTree[]>;

  constructor(root: RouteTree) {
    this.#nodeIndex = new Map();
    this.#chainCache = new Map();
    this.#nameSegmentsCache = new Map();
    this.#siblingsCache = new Map();
    this.#buildIndex(root);
  }

  /**
   * O(1) lookup of a route node by full name.
   *
   * @param name - Full route name (e.g. `"users.profile"`)
   * @returns The route tree node, or `undefined` if not found
   */
  getRoute(name: string): RouteTree | undefined {
    return this.#nodeIndex.get(name);
  }

  /**
   * Returns the ancestor chain from root to the named node (inclusive).
   *
   * Result is cached and frozen — repeated calls return the same array reference.
   *
   * @param name - Full route name (e.g. `"users.profile"`)
   * @returns Frozen array `[root, ..., node]`, or `undefined` if not found
   *
   * @example
   * ```ts
   * utils.getChain("users.profile");
   * // → [root, users, users.profile]
   * ```
   */
  getChain(name: string): readonly RouteTree[] | undefined {
    const cached = this.#chainCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    const node = this.#nodeIndex.get(name);

    if (node === undefined) {
      return undefined;
    }

    const chain: RouteTree[] = [];
    let current: RouteTree | null = node;

    while (current !== null) {
      chain.push(current);
      current = current.parent;
    }

    chain.reverse();
    const frozen = Object.freeze(chain);

    this.#chainCache.set(name, frozen);

    return frozen;
  }

  /**
   * Returns the parent node of the named route.
   *
   * @param name - Full route name
   * @returns Parent node, `null` for root, or `undefined` if not found
   */
  getParent(name: string): RouteTree | null | undefined {
    const node = this.#nodeIndex.get(name);

    if (node === undefined) {
      return undefined;
    }

    return node.parent;
  }

  /**
   * Returns non-absolute siblings of the named node (excluding itself).
   *
   * Siblings are children of the same parent, filtered by `nonAbsoluteChildren`.
   * Result is cached and frozen — repeated calls return the same array reference.
   *
   * @param name - Full route name
   * @returns Frozen array of sibling nodes, or `undefined` if not found or root
   */
  getSiblings(name: string): readonly RouteTree[] | undefined {
    const cached = this.#siblingsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }

    const node = this.#nodeIndex.get(name);

    if (node === undefined) {
      return undefined;
    }
    if (node.parent === null) {
      return undefined;
    }

    const siblings = Object.freeze(
      node.parent.nonAbsoluteChildren.filter((child) => child !== node),
    );

    this.#siblingsCache.set(name, siblings);

    return siblings;
  }

  /**
   * Returns cumulative name segments for the given route.
   *
   * Result is cached and frozen — repeated calls return the same array reference.
   *
   * @param name - Full route name
   * @returns Frozen array of cumulative segments, or `undefined` if not in tree
   *
   * @example
   * ```ts
   * utils.getNameSegments("users.profile.edit");
   * // → ["users", "users.profile", "users.profile.edit"]
   * ```
   */
  getNameSegments(name: string): readonly string[] | undefined {
    const cached = this.#nameSegmentsCache.get(name);

    if (cached !== undefined) {
      return cached;
    }
    if (!this.#nodeIndex.has(name)) {
      return undefined;
    }

    const result = buildNameSegments(name);
    const frozen = Object.freeze(result);

    this.#nameSegmentsCache.set(name, frozen);

    return frozen;
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

  #buildIndex(node: RouteTree): void {
    this.#nodeIndex.set(node.fullName, node);
    for (const child of node.children.values()) {
      this.#buildIndex(child);
    }
  }
}

/**
 * Builds cumulative name segments from a dot-separated route name.
 *
 * Not on a hot path — result is cached by {@link RouteUtils.getNameSegments}.
 *
 * @param name - Full route name (e.g. `"a.b.c"`)
 * @returns Array of cumulative prefixes (e.g. `["a", "a.b", "a.b.c"]`)
 */
function buildNameSegments(name: string): string[] {
  if (name === "") {
    return [""];
  }

  const parts = name.split(".");
  const result: string[] = [];
  let acc = parts[0];

  result.push(acc);
  for (let i = 1; i < parts.length; i++) {
    acc = `${acc}.${parts[i]}`;
    result.push(acc);
  }

  return result;
}

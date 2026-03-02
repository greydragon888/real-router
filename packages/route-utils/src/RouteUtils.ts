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

  /** Returns the route node for the given full name, or undefined if not found. */
  getRoute(name: string): RouteTree | undefined {
    return this.#nodeIndex.get(name);
  }

  /** Returns the ancestor chain from root to the named node (inclusive), or undefined if not found. */
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

  /** Returns the parent of the named node, null for root, or undefined if not found. */
  getParent(name: string): RouteTree | null | undefined {
    const node = this.#nodeIndex.get(name);

    if (node === undefined) {
      return undefined;
    }

    return node.parent;
  }

  /** Returns the non-absolute siblings of the named node (excluding itself), or undefined if not found or root. */
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

  /** Returns all prefix segments for the given full name, or undefined if not in tree. */
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

  /** Returns true if child is a descendant of parent (string prefix check, not tree lookup). */
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

// Helper — implements nameToIDs algorithm with fast paths
function buildNameSegments(name: string): string[] {
  if (name === "") {
    return [""];
  }

  const dot1 = name.indexOf(".");

  if (dot1 === -1) {
    return [name];
  }

  const dot2 = name.indexOf(".", dot1 + 1);

  if (dot2 === -1) {
    return [name.slice(0, dot1), name];
  }

  const dot3 = name.indexOf(".", dot2 + 1);

  if (dot3 === -1) {
    return [name.slice(0, dot1), name.slice(0, dot2), name];
  }

  const dot4 = name.indexOf(".", dot3 + 1);

  if (dot4 === -1) {
    return [
      name.slice(0, dot1),
      name.slice(0, dot2),
      name.slice(0, dot3),
      name,
    ];
  }

  // 5+ segments: general case
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

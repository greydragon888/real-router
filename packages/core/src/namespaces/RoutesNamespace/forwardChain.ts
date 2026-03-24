// packages/core/src/namespaces/RoutesNamespace/forwardChain.ts

export function resolveForwardChain(
  startRoute: string,
  forwardMap: Record<string, string>,
  maxDepth = 100,
): string {
  const visited = new Set<string>();
  const chain: string[] = [startRoute];
  let current = startRoute;

  while (forwardMap[current]) {
    const next = forwardMap[current];

    if (visited.has(next)) {
      const cycleStart = chain.indexOf(next);
      const cycle = [...chain.slice(cycleStart), next];

      throw new Error(`Circular forwardTo: ${cycle.join(" → ")}`);
    }

    visited.add(current);
    chain.push(next);
    current = next;

    if (chain.length > maxDepth) {
      throw new Error(
        `forwardTo chain exceeds maximum depth (${maxDepth}): ${chain.join(" → ")}`,
      );
    }
  }

  return current;
}

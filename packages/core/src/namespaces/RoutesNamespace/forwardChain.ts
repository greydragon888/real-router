// packages/core/src/namespaces/RoutesNamespace/forwardChain.ts

/**
 * The `forwardTo` chain a name resolves to, or the name itself.
 *
 * ⚑ The entry name is coerced ONCE, and that single `String()` is the fix for
 * #1882 rather than a formality. This is a root export taking a name it uses as
 * a PROPERTY KEY, and the walk asked the same question twice — `while
 * (forwardMap[current])` tested one coercion and `const next =
 * forwardMap[current]` indexed another. For a name that answers differently
 * between the two (an accessor-backed or `toString`-backed value, which is
 * supported input), the second read indexed a route the first never named:
 * measured on a map `{ alias: "users", other: "home" }`, a name answering
 * `"alias"` then `"other"` resolved to **`home`** — the forward target of a
 * route the caller never asked about.
 *
 * ⚠ NOT a type gate, and the distinction is load-bearing. #1881 gated three
 * neighbouring doors and #1891 reverted them; `ARCHITECTURE.md` "Route-Name Type
 * Gates" admits a gate only where a STABLE non-string already does damage, and a
 * stable one here answers exactly what its `toString` names — which is what this
 * coercion preserves. It is also the one door of the family with NO validator
 * seam: a free function has nothing for `@real-router/validation-plugin` to hook,
 * and that plugin is itself a consumer, so "bare core degrades, the opt-in
 * validator diagnoses" has nowhere to live here.
 *
 * ⚑ It also makes the declared `: string` return true. With no entry in the map
 * the walk used to hand the caller's own OBJECT straight back.
 */
export function resolveForwardChain(
  startRoute: string,
  forwardMap: Record<string, string>,
  maxDepth = 100,
): string {
  // ⚠ Both the `unknown` hop and the disable below are load-bearing, and neither
  // is style. `startRoute` is DECLARED `string`, and on the strength of that
  // declaration TWO autofixable rules offer to delete this coercion:
  // `@typescript-eslint/no-unnecessary-type-conversion` (which the `unknown`
  // silences) and `unicorn/no-useless-coercion` (which it does not). Running
  // `lint --fix` deleted it twice while this fix was being written — the second
  // time into `const start = raw`, which does not even type-check — silently
  // restoring #1882 both times. The declared type is the CONTRACT; it is not a
  // runtime guarantee, and trusting it is precisely what this function did wrong.
  const raw: unknown = startRoute;
  // eslint-disable-next-line unicorn/no-useless-coercion -- the declared `string` is a contract, not a runtime guarantee (#1882)
  const start = String(raw);
  const visited = new Set<string>();
  const chain: string[] = [start];
  let current = start;

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

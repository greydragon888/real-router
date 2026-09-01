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
 * ⚑ It also makes the declared `: string` return true. Uncoerced, a walk with no
 * entry in the map hands the caller's own OBJECT straight back.
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

  for (;;) {
    // ⚑ ONE map read and ONE coercion per hop, and both halves are the same
    // defect the entry read had (#1882). `while (forwardMap[current])` tested one
    // value and `const next = forwardMap[current]` took another — two questions
    // where the caller sees one — and `current = next` then handed a raw VALUE
    // back to the top, where it was read as a key twice more. The MAP's declared
    // `Record<string, string>` has exactly the status `startRoute: string` has:
    // a contract, not a runtime guarantee. Measured on the export before this,
    // entry name a plain `"a"`, map `{ a: bag→"b" then "c", b: "usersB",
    // c: "usersC" }` → **`usersC`**, the forward target of a route no read of
    // the map ever named on its first answer.
    //
    // ⚠ Core itself cannot produce that map: registration branches on
    // `typeof route.forwardTo === "string"` and sends everything else to
    // `forwardFnMap`, so `config.forwardMap`'s values are strings by
    // construction, and core's one caller (`refreshForwardMap`) walks the map's
    // own keys. This closes the EXPORT's contract, which is the whole reason
    // #1882 was a fix rather than a formality.
    const rawHop: unknown = forwardMap[current];

    if (!rawHop) {
      break;
    }

    // ⚠ The disable is the SAME one the entry read carries twenty lines up, for
    // the same reason and against the same rule. `lint --fix` deleted this
    // coercion the moment it was written — a THIRD time in this family — turning
    // it into `const next = rawHop`, which reds the terminal-hop cell in
    // `read-count-authority.test.ts` and restores the object-return arm.
    // The second rule is `no-base-to-string`, which fires because the falsy
    // check narrows `unknown` to `{}` — i.e. it warns that a plain object
    // stringifies to `"[object Object]"`. It does, and that is precisely what
    // the implicit `ToPropertyKey` behind `forwardMap[current]` produced before
    // this line existed; making it explicit changes nothing except that it
    // happens ONCE. The falsy check must stay above the coercion: `String()` of
    // an absent entry is `"undefined"`, which is truthy and would walk forever.
    // eslint-disable-next-line unicorn/no-useless-coercion, @typescript-eslint/no-base-to-string -- the map's declared `Record<string, string>` is a contract, not a runtime guarantee (#1882)
    const next = String(rawHop);

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

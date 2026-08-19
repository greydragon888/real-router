import type { Params, SearchParams } from "../types";

/**
 * The one key name a caller may not put in a channel bag.
 *
 * ⚑ `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members. Every other member — `toString`, `constructor`, `hasOwnProperty` and
 * the rest — is a plain DATA property, so an own key of that name shadows it
 * correctly and travels through the router like any other name. `__proto__`
 * does not: `bag[key] = value` reaches the inherited SETTER, creates no own
 * key, and the value is gone with no error and no log.
 *
 * ⚠ The remedy is not "write it as data everywhere". That was measured and
 * rejected: it does not keep the hazard in core, it EXPORTS it. Once the key
 * survives into `state.params` / `state.search`, every consumer meets it —
 * and `Object.assign`, which is how application code merges bags, drops it
 * exactly as core did. Measured downstream, `logger-plugin`'s diff accumulator
 * had its PROTOTYPE replaced by caller data and logged a blank line;
 * `persistent-params-plugin` lost the key on every navigation;
 * `search-schema-plugin` corrupted the prototype of the bag it returns AS the
 * state. Nine sites in core and three plugins is the cost of carrying it; one
 * refusal is the cost of not.
 */
const UNSAFE_KEY = "__proto__";

/**
 * The own key a caller may not supply, or `undefined`.
 *
 * `Object.hasOwn`, never `in`: an INHERITED `__proto__` is what every ordinary
 * object has, and refusing that would refuse every bag ever passed.
 */
export function findUnsafeKey(
  bag: Params | SearchParams | undefined,
): string | undefined {
  // ⚠ The `null` arm is LOAD-BEARING. `navigate(name, null)` is supported
  // input (pinned by `navigate/edge-cases-params.test.ts`) and `Object.hasOwn`
  // does `ToObject`, which throws on it. The sibling `findMisChanneledKey`
  // omits the check and survives only because its `queryNames.length === 0`
  // early return fires first for most routes — an accident, not a contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime null guard, the type does not hold here
  return bag !== undefined && bag !== null && Object.hasOwn(bag, UNSAFE_KEY)
    ? UNSAFE_KEY
    : undefined;
}

/**
 * Refuse a caller-supplied bag carrying an own `__proto__`.
 *
 * ⚠ Synchronous, and a `TypeError` rather than a rejected promise — the same
 * call the channel guard (#1572) makes at these same three producers, for the
 * same reason: this is an ARGUMENT-SHAPE defect at the API boundary, caught
 * before any transition exists. Rejecting would let a `.catch()` written for
 * navigation failures swallow a programming error.
 *
 * ⚠ Only the CALLER's bag. A URL carrying `?__proto__=1` is not a programmer
 * error and `match()` must never throw on input (#737) — a link from anywhere
 * would otherwise crash a popstate handler — so the wire direction DROPS the
 * key and reports it through `@real-router/validation-plugin`. And a route's
 * static config (#1788) or a plugin's context namespace (#1191) is a name its
 * author typed deliberately, with no outside payload involved; those are
 * untouched. One rule, keyed on where the data came from.
 */
export function assertNoUnsafeKey(
  method: string,
  params: Params | undefined,
  search: SearchParams | undefined,
): void {
  let channel: string;

  if (findUnsafeKey(params) !== undefined) {
    channel = "params";
  } else if (findUnsafeKey(search) === undefined) {
    return;
  } else {
    channel = "search";
  }

  throw new TypeError(
    `[${method}] The \`${channel}\` bag carries an own "${UNSAFE_KEY}" key, which the router refuses. ` +
      `"${UNSAFE_KEY}" is the only accessor on \`Object.prototype\`, so it cannot be carried as ordinary ` +
      `data without every consumer of \`state\` having to know that — remove it from the bag, or rename ` +
      `the field. (A URL carrying it is different: that is not your code, so it is dropped rather than ` +
      `refused, and \`@real-router/validation-plugin\` reports it.)`,
  );
}

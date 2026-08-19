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
export const UNSAFE_KEY = "__proto__";

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
  if (bag === undefined || bag === null || !Object.hasOwn(bag, UNSAFE_KEY)) {
    return undefined;
  }

  // ⚑ `undefined`-BLIND, following the channel guard's documented rule for the
  // same reason: `undefined` means "I said nothing" everywhere in this router
  // (INVARIANTS makeState #5), so `{ __proto__: undefined }` is the removal
  // marker, not a caller insisting on the name. Refusing it would make the
  // absence of a value louder than the value.
  //
  // ⚠ Not a hole: the key still reaches `pipeline/canonicalize`, which strips it
  // and reports it through the opt-in sink — so the shape is handled, just not
  // by a throw. Found by sweeping every value form through the door rather than
  // the ones that came to mind.
  return (bag as Record<string, unknown>)[UNSAFE_KEY] === undefined
    ? undefined
    : UNSAFE_KEY;
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
 *
 * ⚠ It does NOT pre-empt the caller's own error, and an earlier draft of this
 * note claimed it did. Measured against `origin/master` across seven container
 * shapes: a `Proxy` whose `get` trap throws, and one whose
 * `getOwnPropertyDescriptor` trap throws, surface the CALLER's error on both
 * revisions — identical. The one row that moves is a `has`-trap bag, and it
 * moves because the refusal is a new OUTCOME, not because an error was
 * displaced: nothing on this path consults `has`, so that trap never fired on
 * master either. The sibling channel guard's rule — a diagnostic must never
 * become the thing that throws — is therefore respected here rather than
 * departed from.
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

/**
 * Refuse a ROUTE whose own defaults carry an own `__proto__`, at config time.
 *
 * ⚑ The third source category, and the one the first draft of this rule missed.
 * A route's `defaultSearch` / `defaultParams` entry is typed by the developer,
 * so it looks like the "static config" case that #1788 and #1191 deliberately
 * PRESERVE — but unlike a custom field or a context namespace, it does not stay
 * in the config: it flows into `state.search` / `state.params`, the very channel
 * a caller's bag is refused from. Preserving it there would publish the key by
 * the back door.
 *
 * ⚠ So the refusal is at REGISTRATION, not at navigation, and that is the same
 * reasoning `assertRouteDefaultChannels` records beside it: both sides are known
 * at `createRouter` / `add` / `replace` / `update` / `setRootPath`, so failing
 * there names the route and the slot instead of throwing later about a bag the
 * user never passed. Measured before this existed: the default was silently lost
 * in the merge — even with nothing filled — so a developer got neither the key
 * nor a word about it.
 */
export function assertRouteDefaultsSafe(
  defaultParams: Readonly<Record<string, Params>>,
  defaultSearch: Readonly<Record<string, SearchParams>>,
  method: string,
): void {
  const tables: readonly (readonly [
    string,
    Readonly<Record<string, Params | SearchParams>>,
  ])[] = [
    ["defaultParams", defaultParams],
    ["defaultSearch", defaultSearch],
  ];

  for (const [slot, table] of tables) {
    for (const [name, defaults] of Object.entries(table)) {
      if (findUnsafeKey(defaults) !== undefined) {
        throw new TypeError(
          `[${method}] Route "${name}" declares a \`${slot}\` entry named "${UNSAFE_KEY}", which the router refuses. ` +
            `That default would flow into the state channel a caller's own bag is refused from, so admitting it here ` +
            `would publish "${UNSAFE_KEY}" by the back door — and "${UNSAFE_KEY}" is the only accessor on ` +
            `\`Object.prototype\`, so no consumer of \`state\` can treat it as an ordinary key. Rename the field.`,
        );
      }
    }
  }
}

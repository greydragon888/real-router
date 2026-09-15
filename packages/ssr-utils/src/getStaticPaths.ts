import { getPluginApi } from "@real-router/core/api";

import type { RouteTree } from "@real-router/core";
import type {
  DefaultDependencies,
  Params,
  Router,
  SearchParams,
  State,
} from "@real-router/core/types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;
const objectKeys = Object.keys;

/**
 * One page to generate: the two channels a URL is built from (RFC-4 M2 /
 * #1548).
 *
 * Both slots are optional — a route with only path slots names `params`, one
 * with only a query names `search`, and `/doc/:id?rev` names both. There is
 * deliberately NO single-bag form: which channel a key belongs to is the
 * caller's contract everywhere else in the router (`navigate` throws on a
 * declared query name handed in the path bag), and a flat bag cannot express
 * that contract — expressing it in the type is what moves the mistake from a
 * short manifest to a compile error (#1580).
 */
export interface StaticPathEntry {
  readonly params?: Params;
  readonly search?: SearchParams;
}

export type StaticPathEntries = Record<
  string,
  () => Promise<readonly StaticPathEntry[]>
>;

function collectLeafRouteNames(node: RouteTree, result: string[]): void {
  for (const child of node.children.values()) {
    if (child.children.size === 0) {
      result.push(child.fullName);
    } else {
      // Accumulate into the shared array rather than
      // `result.push(...getLeafRouteNames(child))`: the spread passes one
      // argument per leaf, and V8 caps spread/apply arguments (~124k on Node 24),
      // so a section with that many static leaf routes overflows with
      // `RangeError: Maximum call stack size exceeded`. Accumulating also drops
      // the per-subtree intermediate-array allocation.
      collectLeafRouteNames(child, result);
    }
  }
}

function getLeafRouteNames(node: RouteTree): string[] {
  const result: string[] = [];

  collectLeafRouteNames(node, result);

  return result;
}

/**
 * Every key the entry supplied that did NOT survive into the built URL.
 *
 * Asked of the URL, not of the route's declarations, and that is the whole
 * point: the registry that decides a key's channel is the one that PRINTS
 * (#1556), so re-deriving it here would drift from it. Reading
 * `paramMeta.queryParams` off the leaf node is wrong three ways — it reports
 * the `/items/:id?id` collision as a query name
 * (core excludes it, #843/#1549) and it sees neither an ancestor's `?q` nor a
 * `setRootPath("?lang")` declaration. Matching the URL back sees all three, and
 * adapts to `queryParamsMode` for free: a key the active mode refuses to print
 * is a key that cannot survive.
 *
 * Presence, not equality, is the test — and that is deliberate rather than
 * lazy. The question is whether the key reached the URL, which presence answers
 * exactly; comparing VALUES would be actively wrong, because a route's
 * `encodeParams` may legitimately rewrite one on the way out (`"a"` printed as
 * `"A"`) and the page is generated correctly all the same. It also sidesteps the
 * mixed domain #1554 documents, where the URL direction parses `?page=1` back as
 * the number `1` while the entry still holds the string. `undefined` is absence
 * on the layered terms `undefined-strip.properties.ts` states (#1550 / #1551).
 */
function findLostKeys(
  supplied: Readonly<Record<string, unknown>>,
  matched: State | undefined,
): string[] {
  // One narrowing instead of a `?.` per read. `matchPath` is typed
  // `State | undefined`, but a URL this router's own `buildPath` just produced
  // always matches back — probed across splats, encoders that inject `/`, `?`
  // and `#` (all percent-encoded), every `trailingSlash` mode,
  // `rewritePathOnMatch: false`, `setRootPath` and all three `queryParamsMode`
  // values. The arm is therefore unreachable rather than merely untested; it is
  // kept because the TYPE admits it, and treating "did not match" as "carried
  // nothing" is the answer that fails loudly rather than silently.
  /* v8 ignore next -- @preserve: unreachable — buildPath and matchPath are inverse for a URL this router just built (probed); kept because the type admits undefined */
  const carried =
    matched === undefined ? {} : { ...matched.params, ...matched.search };
  const lost: string[] = [];

  for (const [key, value] of objectEntries(supplied)) {
    if (value === undefined) {
      continue;
    }

    if (!hasOwn(carried, key)) {
      lost.push(key);
    }
  }

  return lost;
}

function lostKeysMessage(
  routeName: string,
  path: string,
  lost: readonly string[],
): string {
  const keys = lost.map((key) => `\`${key}\``).join(", ");
  const them = lost.length > 1 ? "those keys" : "that key";

  return (
    `[getStaticPaths] Route "${routeName}" built "${path}", which does not carry ${keys}. ` +
    `Every entry differing only in ${them} generates the same page, so the manifest ` +
    `silently loses the rest. Either the key belongs to the other channel — a name the ` +
    `route declares with \`?\` goes in \`search\`, a path slot in \`params\` — or the route ` +
    `declares it nowhere and the active \`queryParamsMode\` will not print it.`
  );
}

/**
 * One page's URL, refusing to produce a silently-wrong one.
 *
 * Extracted from the loop rather than inlined: the guard adds a nesting level to
 * an already-branching fan-out, which pushes the enumerator past the cognitive
 * complexity budget for no gain in clarity.
 */
function pathForEntry<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  matchPath: (path: string) => State | undefined,
  routeName: string,
  entry: StaticPathEntry,
): string {
  const path = router.buildPath(routeName, entry.params ?? {}, entry.search);
  const supplied = { ...entry.params, ...entry.search };

  // An entry that supplied nothing has nothing to lose, and skipping the round
  // trip keeps the common leaf walk allocation-cheap at scale.
  if (objectKeys(supplied).length === 0) {
    return path;
  }

  const lost = findLostKeys(supplied, matchPath(path));

  // Silence here is a manifest quietly missing pages: a key that never reaches
  // the URL collapses every entry differing only in it onto one file, and a
  // short manifest looks exactly like a correct one. SSG is a build step, so
  // failing it is cheap and it is the only signal the author gets.
  if (lost.length > 0) {
    throw new TypeError(lostKeysMessage(routeName, path, lost));
  }

  return path;
}

/**
 * The URL a `<Link>` to this route would render, or `undefined` when the route
 * does not forward.
 *
 * ⚑ **`forwardState`, the door `buildHref` asks.** Both it and
 * `buildNavigationState` resolve the whole chain and print the same URL, but the
 * committing door opts into `reportUndeclaredParamKey`, and enumerating a
 * manifest commits nothing — `shared/dom-utils/link-utils.ts` records that
 * choice for the href itself, and this is the same question one layer up.
 * Asking a different door than the href asks is how a check and the thing it
 * checks drift apart.
 *
 * ⚠ **Forwarding is decided by BEHAVIOUR, not by a declaration.** The predicate
 * is `terminal.name !== routeName`, so a dynamic `forwardTo: () => …` is covered
 * and a `forwardTo` resolving back to itself costs nothing. Same reason
 * `findLostKeys` asks the URL rather than the leaf's `paramMeta`.
 */
function forwardedHref<Dependencies extends DefaultDependencies>(
  router: Router<Dependencies>,
  api: ReturnType<typeof getPluginApi<Dependencies>>,
  routeName: string,
  entry: StaticPathEntry,
): string | undefined {
  const terminal = api.forwardState(
    routeName,
    entry.params ?? {},
    entry.search,
  );

  if (terminal.name === routeName) {
    return undefined;
  }

  // ⚠ The terminal may need a slot the source never declared, and then this
  // throws exactly as the href does — the author gets the printer's own message
  // about the route they forwarded TO, which names the missing slot. Swallowing
  // it would trade a precise failure for a vaguer one.
  return router.buildPath(terminal.name, terminal.params, terminal.search);
}

/**
 * Every enumerated forwarding leaf lands on a URL the manifest produced (#2256).
 *
 * Since #2250 an href RESOLVES the chain, while this function prints the LITERAL
 * form — the one that answers about the route it was NAMED (INVARIANTS #8). So an
 * entry supplied for a forwarding source writes a file at the SOURCE's URL while
 * every `<Link>` to it names the TARGET's, which nothing produced. On a static
 * host that is a silent 404 and no build step fails.
 *
 * ⚠ **It reports; it does not emit.** `getStaticPaths` is leaf-only by an
 * explicit contract (#608, closed NOT_PLANNED: explicit over magic), so inferring
 * a page the author did not enumerate is precisely what that decision refuses.
 * Both URLs go in the message and the choice stays the author's — drop the
 * forwarding source from `entries`, or enumerate the target.
 *
 * ⚠ **Run over the FINISHED manifest, not inside the walk.** The target's own
 * entries may be produced after the source's, so a check inside the loop would
 * fail on ordering rather than on coverage.
 */
function assertForwardedTargetsEnumerated<
  Dependencies extends DefaultDependencies,
>(
  router: Router<Dependencies>,
  api: ReturnType<typeof getPluginApi<Dependencies>>,
  paths: readonly string[],
  enumerated: readonly { routeName: string; entry: StaticPathEntry }[],
): void {
  for (const { routeName, entry } of enumerated) {
    const href = forwardedHref(router, api, routeName, entry);

    if (href === undefined || paths.includes(href)) {
      continue;
    }

    throw new TypeError(
      `[getStaticPaths] Route "${routeName}" forwards, so every \`<Link>\` to it renders ` +
        `"${href}" — and no entry produced that page. The manifest carries the SOURCE's ` +
        `URL instead, which nothing navigates to, so the target 404s on a static host. ` +
        `Either enumerate the target route, or drop "${routeName}" from \`entries\` and ` +
        `let the link resolve at runtime.`,
    );
  }
}

export async function getStaticPaths<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  entries?: StaticPathEntries,
): Promise<string[]> {
  const api = getPluginApi(router);
  const matchPath = (path: string): State | undefined => api.matchPath(path);
  const leafRoutes = getLeafRouteNames(api.getTree());
  const paths: string[] = [];
  const enumerated: { routeName: string; entry: StaticPathEntry }[] = [];

  for (const routeName of leafRoutes) {
    const entryFn = entries?.[routeName];

    if (entryFn) {
      const entrySets = await entryFn();

      for (const entry of entrySets) {
        paths.push(pathForEntry(router, matchPath, routeName, entry));
        enumerated.push({ routeName, entry });
      }
    } else {
      paths.push(router.buildPath(routeName, {}));
    }
  }

  assertForwardedTargetsEnumerated(router, api, paths, enumerated);

  return paths;
}

import type {
  NavigationOptions,
  NavigationTarget,
  Params,
  Router,
  SearchParams,
  State,
} from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — they answer "what is on this object" for a value this module
 * did not build. Read off the live global they can be re-pointed after boot, and
 * `shared/` is the half where that fails OPEN: measured in `browser-env`, a
 * re-pointed `getPrototypeOf` admits a `Date` into `state.params` and a
 * re-pointed `keys` skips option validation entirely.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it (#1798).
 */
const objectKeys = Object.keys;

/**
 * Resolved navigation channels for a `<Link>` — the single `{ name, params,
 * search }` shape every adapter feeds into `buildHref` / `navigateWithHash` /
 * the active-route source, regardless of which prop form the consumer used.
 */
export interface ResolvedLinkTarget {
  name: string;
  params: Params | undefined;
  search: SearchParams | undefined;
}

/**
 * Collapses a `<Link>`'s two prop forms (RFC-4 M2 B2, #1548) into one channel
 * triple:
 *
 * - **Descriptor** — `to={{ name, params?, search? }}` (a `NavigationTarget`).
 * - **Channel props** — `routeName` + `routeParams?` + `routeSearch?`.
 *
 * The forms are mutually exclusive: the TS union on each adapter's `LinkProps`
 * rejects mixing them at compile time, and this helper is the runtime backstop —
 * when `to` is present it **wins**, and a `dev`-visible `console.warn` fires if
 * channel props were also supplied (a JS consumer, an object spread, or an
 * adapter without a strict union can still slip both through). `routeOptions` /
 * `hash` are separate props under BOTH forms (hash is not part of
 * `NavigationTarget` — #532), so they are resolved by the caller, not here.
 */
export function resolveLinkTarget(
  to: NavigationTarget | undefined,
  routeName: string,
  routeParams: Params | undefined,
  routeSearch: SearchParams | undefined,
): ResolvedLinkTarget {
  if (to !== undefined) {
    if (
      routeName !== "" ||
      routeParams !== undefined ||
      routeSearch !== undefined
    ) {
      console.warn(
        "[real-router] <Link> received both `to` and channel props " +
          "(routeName / routeParams / routeSearch). `to` wins; the channel " +
          "props are ignored. Use one form or the other.",
      );
    }

    return { name: to.name, params: to.params, search: to.search };
  }

  return { name: routeName, params: routeParams, search: routeSearch };
}

export function shouldNavigate(evt: MouseEvent): boolean {
  return (
    evt.button === 0 &&
    !evt.metaKey &&
    !evt.altKey &&
    !evt.ctrlKey &&
    !evt.shiftKey
  );
}

/**
 * RFC 3986 fragment encoding: preserve sub-delims (`&`, `=`, `?`, `:`),
 * encode space, `%`, control chars, non-ASCII via encodeURI; defensively
 * escape `#` (encodeURI does not). Kept BYTE-FOR-BYTE identical to
 * `encodeHashFragment` in `shared/browser-env/url-context.ts` — duplicated
 * because the shared/dom-utils symlink graph does not reach shared/browser-env;
 * a sync test (`link-utils` functional suite) asserts the two stay identical.
 *
 * **STRICTLY-DECODED contract (#1211 / D1=A).** The `<Link hash>` value is a
 * DECODED fragment (no leading `#`) and is encoded verbatim. This OVERTURNS
 * audit-2026-05-17 §5 E.1 — the earlier percent-escape probe (decode + re-encode
 * for copy-from-`location.hash` tolerance) is REMOVED, so both the adapter and
 * the plugin layer obey one contract: `<Link hash="a%20b">` renders `#a%2520b`
 * (the literal fragment `a%20b`) under every runtime. Consumers who want the
 * fragment `a b` pass `hash="a b"`; passing raw `location.hash` (percent-encoded)
 * is no longer supported — it was the source of the plugin↔adapter divergence.
 */
function encodeFragmentInline(decoded: string): string {
  return encodeURI(decoded).replaceAll("#", "%23");
}

type BuildUrlFn = (
  name: string,
  params: Params,
  search?: SearchParams,
  options?: { hash?: string },
) => string | undefined;

/**
 * Builds an href for a `<Link>` element.
 *
 * - Prefers the URL plugin's `buildUrl` (browser-plugin, navigation-plugin,
 *   hash-plugin) when present.
 * - Falls back to `router.buildPath` for runtimes without a URL plugin
 *   (memory-plugin, console UIs, NativeScript). In that fallback the hash
 *   is appended manually so the rendered href is still correct.
 * - The optional 4th argument is the decoded hash fragment (no leading "#";
 *   `<Link hash="#section">` is accepted defensively — leading "#" stripped),
 *   passed positionally to mirror `navigateWithHash(router, name, params, hash)`
 *   (#1442). Previous 3-arg call sites continue to work unchanged.
 */
export function buildHref(
  router: Router,
  routeName: string,
  routeParams: Params,
  routeSearch?: SearchParams,
  hash?: string,
): string | undefined {
  try {
    let normHash: string | undefined;

    if (hash !== undefined) {
      normHash = hash.startsWith("#") ? hash.slice(1) : hash;
    }

    const buildUrl = router.buildUrl as BuildUrlFn | undefined;

    if (buildUrl) {
      const url = buildUrl(
        routeName,
        routeParams,
        // Query channel at position 3 (RFC-4 M2 / #1548) — from the `routeSearch`
        // prop; hash options at position 4. `undefined` when the link has no
        // `routeSearch` (its query, if any, still rides in routeParams).
        routeSearch,
        normHash === undefined ? undefined : { hash: normHash },
      );

      // Accept only non-empty strings. The BuildUrlFn type contract is
      // `string | undefined`, but defensive against:
      //   - `""` (empty string) → would render `<a href="">`, which resolves
      //     to the current page URL → silent self-navigation on click.
      //   - `null` (type-contract violation) → would render `<a href={null}>`,
      //     stringified to `"null"` in some renderers.
      // Either case falls through to the `router.buildPath` fallback below.
      if (typeof url === "string" && url.length > 0) {
        return url;
      }
    }

    const path = router.buildPath(routeName, routeParams, routeSearch);

    // Symmetric to the buildUrl guard above (#S1 audit, Invariant 12).
    // `router.buildPath` is typed `string`, but defends against:
    //   - `""` (empty string) — would render `<a href="">`, which resolves
    //     to the current page URL → silent self-navigation on click.
    //   - non-string type-contract violations from custom path-matchers.
    // Both yield `undefined` (renderer drops the attribute) with a warning.
    if (typeof path !== "string" || path.length === 0) {
      console.error(
        `[real-router] Route "${routeName}" yielded an empty path. The element will render without an href attribute.`,
      );

      return undefined;
    }

    return normHash ? `${path}#${encodeFragmentInline(normHash)}` : path;
  } catch {
    console.error(
      `[real-router] Route "${routeName}" is not defined. The element will render without an href attribute.`,
    );

    return undefined;
  }
}

/**
 * `<Link>` click-handler navigation helper (#532).
 *
 * Wraps `router.navigate(name, params, search, opts)` — the query channel took
 * slot 3 in RFC-4 M2 (#1548) — with same-route different-hash
 * detection: when the consumer clicks a hash-bearing Link that targets the
 * current route with the same params but a different fragment, core's
 * SAME_STATES check would otherwise reject the navigation. The helper adds
 * `force: true` and `hashChange: true` automatically — subscribers can then
 * disambiguate via `state.context.url.hashChanged`.
 *
 * For pure programmatic same-route hash-only navigation, callers are
 * documented to pass `{ force: true }` themselves; the auto-bypass here is
 * a UX convenience for `<Link hash>` that all 6 framework adapters share.
 */
/**
 * Local extended-options type. Adapters that depend only on `@real-router/core`
 * (without a URL plugin) do not see the `NavigationOptions` augmentation that
 * declares `hash` / `hashChange`. Casting to this widened type inside the
 * helper keeps shared/dom-utils self-contained — adapters do not need to
 * augment NavigationOptions themselves to consume `<Link hash>`.
 */
type HashAwareNavigationOptions = NavigationOptions & {
  hash?: string;
  hashChange?: boolean;
};

export function navigateWithHash(
  router: Router,
  routeName: string,
  routeParams: Params,
  routeSearch: SearchParams | undefined,
  hash: string | undefined,
  extraOptions?: NavigationOptions,
): Promise<State> {
  const opts: HashAwareNavigationOptions = { ...extraOptions };

  if (hash !== undefined) {
    opts.hash = hash;
  }

  const current = router.getState();

  // What the navigation gets — the caller's `routeSearch` unless the bypass
  // below substitutes it (#1925).
  let navigatedSearch = routeSearch;

  if (current !== undefined) {
    // ONE expression, asked ONCE and navigated with under the bypass (#1925).
    // The predicate's answer is only as good as the value it answered ABOUT, so
    // the two must be the same value — a second copy of this expression would
    // let them drift apart with nothing to catch it. The name is what keeps
    // them in agreement structurally rather than by convention.
    const sameLocationSearch = routeSearch ?? current.search;

    // "Does this link point at where we already are?" is a question the router
    // owns, and asking it here by hand got two things wrong at once (#1555).
    //
    // The hand-rolled version compared with `Object.is` per key, so a link
    // writing `routeSearch={{ page: "2" }}` never matched a state parsed from
    // `?page=2`, where the value is the NUMBER 2 — the bypass silently did not
    // fire, core rejected the navigation as SAME_STATES, and `<Link hash>`
    // looked dead. The predicate carries the provenance-tolerant comparison
    // (#1554) that makes the two forms equal because they print the same URL.
    //
    // It also compared the caller's whole `routeParams` bag against
    // `state.params`, which stopped meaning anything once the channels split
    // (#1548) — the predicate applies the channel rule instead of re-deriving
    // it.
    //
    // `strictEquality: true` — a link to a PARENT route is a different
    // location, so the hierarchical arm must not match. `ignoreQueryParams:
    // false` — the query is part of the location here; ignoring it would fire
    // the bypass across a real query change and let `force: true` smuggle it
    // through as a hash change.
    if (
      router.isActiveRoute(
        routeName,
        routeParams,
        sameLocationSearch,
        true,
        false,
      )
    ) {
      const currentHash =
        (current.context as { url?: { hash?: string } } | undefined)?.url
          ?.hash ?? "";
      const newHash = hash ?? currentHash;

      if (currentHash !== newHash) {
        opts.force = true;
        opts.hashChange = true;

        // Reaching here means the predicate answered "this is where we already
        // are, only the fragment differs", and `force` + `hashChange` announce
        // exactly that. The bare `routeSearch` would say "no query" rather than
        // "unchanged" — on `/docs?tab=api` a fragment link would land on
        // `/docs`, moving the location it just announced as unmoved. Same slot,
        // same conclusion as `scroll-spy.ts`, which re-navigates with both
        // channels of the CURRENT state.
        //
        // ⚠ Only under the bypass. Without it the helper claims no sameness, so
        // `<Link routeName="docs">` means `/docs` — substituting there would
        // turn a real navigation into a no-op. An explicit `routeSearch={{}}`
        // still clears the query, because `{}` is not nullish. Both pinned by
        // the #1925 suite.
        navigatedSearch = sameLocationSearch;
      }
    }
  }

  // Query channel at position 3 (RFC-4 M2 / #1548); opts at position 4.
  return router.navigate(routeName, routeParams, navigatedSearch, opts);
}

// Match-any-whitespace regex shared across calls. RegExp literals at
// call-site recompile in some engines; lifting it avoids that microcost
// for the slow-path branch.
const WHITESPACE_PROBE = /\s/;
const WHITESPACE_SPLIT = /\S+/g;

// `value` is always a truthy class string: both call sites narrow it first
// (`if (isActive && activeClassName)` / `if (!baseClassName) return …`), so the
// former `if (!value) return []` guard was unreachable dead code (#809).
function parseTokens(value: string): string[] {
  // Hot-path fast-path (audit-2026-05-17 §8b #1): >99% of active-class
  // inputs at `<Link>` emit are single-token strings like `"active"` or
  // `"is-current"` — no whitespace, no leading/trailing pad. Skip the
  // regex match and Array result allocation: a literal `[value]` works
  // because the slow-path `match(/\S+/g)` would return exactly `[value]`
  // for the same input. PBT lock: linkUtils.properties.ts Invariant 13.
  if (!WHITESPACE_PROBE.test(value)) {
    return [value];
  }

  return value.match(WHITESPACE_SPLIT) ?? [];
}

export function buildActiveClassName(
  isActive: boolean,
  activeClassName: string | undefined,
  baseClassName: string | undefined,
): string | undefined {
  if (isActive && activeClassName) {
    const activeTokens = parseTokens(activeClassName);

    if (activeTokens.length === 0) {
      return baseClassName ?? undefined;
    }
    if (!baseClassName) {
      return activeTokens.join(" ");
    }

    const baseTokens = parseTokens(baseClassName);
    const seen = new Set(baseTokens);

    for (const token of activeTokens) {
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      baseTokens.push(token);
    }

    return baseTokens.join(" ");
  }

  return baseClassName ?? undefined;
}

/**
 * One-level structural equality using `Object.is` per key.
 *
 * **String-keyed properties only (Mini-sprint E.3 — audit-5 §4.2 #3).**
 * Implementation walks `Object.keys()` which by spec returns only
 * enumerable own STRING keys. Symbol-keyed properties — created via
 * `obj[Symbol("brand")] = value` or `{ [Symbol(...)]: value }` — are
 * NOT compared. Two records that differ only in a Symbol-keyed value
 * will compare as equal.
 *
 * This is intentional: route params and Link options are documented as
 * string-keyed primitives (string | number | boolean) — Symbol-keyed
 * metadata (e.g. brand markers, private state) doesn't belong in a
 * cache-key comparison. Switching to `Reflect.ownKeys()` would extend
 * the contract to symbols at the cost of one extra allocation per call
 * (Reflect.ownKeys composes string-keys + symbol-keys arrays). If a
 * consumer relies on symbol-keyed metadata for navigation
 * disambiguation, they should encode it into a string key instead.
 *
 * Mirrors React's `shallowEqual` (packages/shared/shallowEqual.js) in
 * both the string-keys-only semantics and the `hasOwnProperty` guard
 * below.
 */
export function shallowEqual(
  prev: object | undefined,
  next: object | undefined,
): boolean {
  if (Object.is(prev, next)) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }

  const prevKeys = objectKeys(prev);
  const nextKeys = objectKeys(next);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  const prevRecord = prev as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;

  for (const key of prevKeys) {
    // ⚑ Membership is decided from the LIST the count produced, never from a
    // second question put to the record (#2064; #1815 settled the same question
    // for `recordsShallowEqual` in core). `Object.keys` is own AND enumerable
    // while `hasOwnProperty` is own only — and on a Proxy it is whatever the
    // `getOwnPropertyDescriptor` trap answers.
    //
    // ⚠ `key in next`, `Object.hasOwn` and `propertyIsEnumerable` are the same
    // family, and none of them is the fix: each leaves a cell of this file's
    // own suites red. `lint:membership` is the ratchet over the class.
    //
    // The second array is free: the count already built it and threw it away.
    if (
      !nextKeys.includes(key) ||
      !Object.is(prevRecord[key], nextRecord[key])
    ) {
      return false;
    }
  }

  return true;
}

export function applyLinkA11y(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }

  // Cross-realm safety (audit-2026-05-17 §5 HIGH #4):
  // `instanceof HTMLAnchorElement` compares against the constructor from
  // the CURRENT realm. An element created in a different window (iframe
  // contentDocument, micro-frontend, embedded widget) fails the check
  // even when it IS a real anchor — the helper would then inject
  // role="link" + tabindex="0" on top of native anchor semantics,
  // breaking screen reader output ("link link") and focus order.
  //
  // tagName is realm-agnostic and is uppercase for HTML-namespaced
  // elements in any document. SVG `<a>` has lowercase tagName plus a
  // different prototype (SVGAElement) — skipping it here is wrong by
  // accident: SVG anchors don't have keyboard activation semantics the
  // helper would add. But they also don't reach this helper in
  // practice (router Link components emit HTML anchors). Lock the
  // uppercase compare to keep the contract narrow.
  const tag = element.tagName;

  if (tag === "A" || tag === "BUTTON") {
    return;
  }
  if (!element.hasAttribute("role")) {
    element.setAttribute("role", "link");
  }
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "0");
  }
}

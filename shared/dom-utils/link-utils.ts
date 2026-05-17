import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";

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
 * escape `#` (encodeURI does not). Mirrors `encodeHashFragment` in
 * `shared/browser-env/url-context.ts` — duplicated here because the
 * shared/dom-utils symlink graph does not reach shared/browser-env.
 */
function encodeFragmentInline(decoded: string): string {
  return encodeURI(decoded).replaceAll("#", "%23");
}

type BuildUrlFn = (
  name: string,
  params: Params,
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
 * - The optional 4th argument is an options object so the contract stays
 *   extensible. The `hash` option is a decoded fragment without leading "#";
 *   `<Link hash="#section">` is accepted defensively (leading "#" stripped).
 *   Frozen API: previous 3-arg call sites continue to work unchanged.
 */
export function buildHref(
  router: Router,
  routeName: string,
  routeParams: Params,
  options?: { hash?: string },
): string | undefined {
  try {
    const rawHash = options?.hash;
    let normHash: string | undefined;

    if (rawHash !== undefined) {
      normHash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
    }

    const buildUrl = router.buildUrl as BuildUrlFn | undefined;

    if (buildUrl) {
      const url = buildUrl(
        routeName,
        routeParams,
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

    const path = router.buildPath(routeName, routeParams);

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
 * Wraps `router.navigate(name, params, opts)` with same-route different-hash
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
  hash: string | undefined,
  extraOptions?: NavigationOptions,
): Promise<State> {
  const opts: HashAwareNavigationOptions = { ...extraOptions };

  if (hash !== undefined) {
    opts.hash = hash;
  }

  const current = router.getState();

  if (
    current?.name === routeName &&
    shallowEqual(current.params, routeParams)
  ) {
    const currentHash =
      (current.context as { url?: { hash?: string } } | undefined)?.url?.hash ??
      "";
    const newHash = hash ?? currentHash;

    if (currentHash !== newHash) {
      opts.force = true;
      opts.hashChange = true;
    }
  }

  return router.navigate(routeName, routeParams, opts);
}

function parseTokens(value: string | undefined): string[] {
  return value ? (value.match(/\S+/g) ?? []) : [];
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
      if (!seen.has(token)) {
        seen.add(token);
        baseTokens.push(token);
      }
    }

    return baseTokens.join(" ");
  }

  return baseClassName ?? undefined;
}

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

  const prevKeys = Object.keys(prev);

  if (prevKeys.length !== Object.keys(next).length) {
    return false;
  }

  const prevRecord = prev as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;

  for (const key of prevKeys) {
    // hasOwnProperty guard: without it, a key missing in `next` reads as
    // `undefined` and falsely matches `prev[key] === undefined`. Same shape
    // as React's shallowEqual (packages/shared/shallowEqual.js).
    if (
      !Object.prototype.hasOwnProperty.call(next, key) ||
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
  if (
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLButtonElement
  ) {
    return;
  }
  if (!element.hasAttribute("role")) {
    element.setAttribute("role", "link");
  }
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "0");
  }
}

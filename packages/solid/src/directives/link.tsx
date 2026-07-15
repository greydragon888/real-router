import { createActiveRouteSource } from "@real-router/sources";
import { createEffect, onCleanup } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { createSignalFromSource } from "../createSignalFromSource";
import { shouldNavigate, applyLinkA11y, buildHref } from "../dom-utils";
import { useRouter } from "../hooks/useRouter";

import type { Params } from "@real-router/core";

export interface LinkDirectiveOptions<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  routeOptions?: Record<string, unknown>;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
}

// `use:link` value type. Solid's compiler wraps the value into an accessor
// (`use:link={X}` → `link(el, () => X)`), so the value IS the options object —
// hence the OBJECT form `use:link={{ routeName }}` is canonical. The accessor
// form `use:link={() => ({ routeName })}` double-wraps into `() => (() => opts)`,
// so the directive receives a function and silently fails (no href, no nav).
// The augmentation lives HERE (not in a standalone .d.ts) so tsc emits it and
// rollup-plugin-dts bundles it into the published types — consumers get the same
// strict `use:link` typing the package compiles against. See #976.
declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      link: LinkDirectiveOptions | undefined;
    }
  }
}

export function link<P extends Params = Params>(
  element: HTMLElement,
  accessor: () => LinkDirectiveOptions<P>,
): void {
  const router = useRouter();
  const options = accessor();

  // audit-2026-05-17 §8a cleanup — single instanceof probe, single EMPTY_PARAMS
  // default. Previously evaluated three times for the <a>-only branches and
  // twice for routeParams. The directive accessor is read once at init
  // (documented "use:link Options Are Captured Once"), so both lookups are
  // stable and worth hoisting.
  const anchor = element instanceof HTMLAnchorElement ? element : null;
  const resolvedRouteParams = (options.routeParams ?? EMPTY_PARAMS) as P;
  const resolvedRouteOptions = options.routeOptions ?? EMPTY_OPTIONS;

  // Set href on <a> elements
  if (anchor) {
    const href = buildHref(router, options.routeName, resolvedRouteParams);

    if (href === undefined) {
      anchor.removeAttribute("href");
    } else {
      anchor.href = href;
    }
  }

  applyLinkA11y(element);

  // Active class tracking: only `isActive` is reactive (createEffect toggles
  // the class on each emit). The `options` object itself is captured ONCE at
  // init (see gotcha "use:link Options Are Captured Once") — changing
  // `activeClassName` / `routeName` / `routeParams` later has no effect.
  if (options.activeClassName) {
    const activeClassName = options.activeClassName;
    const activeSource = createActiveRouteSource(
      router,
      options.routeName,
      // Pass RAW `options.routeParams` (NOT the EMPTY_PARAMS-defaulted
      // `resolvedRouteParams`). When params are omitted the raw value is
      // `undefined`, which `createActiveRouteSource` keys as the canonical ""
      // (never "{}"), so a no-params `use:link` shares ONE cached source + one
      // router subscription with a sibling `<Link>` (`components/Link.tsx` passes
      // raw `props.routeParams` for the same reason) — the #776 contract.
      // `resolvedRouteParams` stays for buildHref (concrete object) + navigate.
      // (#1438 — the audit-§8a hoist reintroduced the default on this path.)
      options.routeParams,
      {
        strict: options.activeStrict ?? false,
        ignoreQueryParams: options.ignoreQueryParams ?? true,
      },
    );
    const isActive = createSignalFromSource(activeSource);

    createEffect(() => {
      element.classList.toggle(activeClassName, isActive());
    });
  }

  // Click handler
  function handleClick(evt: MouseEvent) {
    if (!shouldNavigate(evt)) {
      return;
    }

    // Mini-sprint E.2 (audit-5 §4.2 #2) — respect upstream
    // preventDefault. `<Link>` checks `local.onClick(evt); if
    // (evt.defaultPrevented) return;` because it owns the React-style
    // onClick prop. The directive has no equivalent prop, but the
    // consumer may register their OWN click listener on the same
    // element (DOM event order is "addEventListener queue, in
    // registration order"). If their listener called preventDefault
    // to opt-out of navigation, the directive must honour that.
    if (evt.defaultPrevented) {
      return;
    }

    // Symmetric with <Link> (#P0.6 audit): on an <a target="_blank"> the
    // browser opens the URL in a new tab/window natively. Intercepting the
    // click via preventDefault + router.navigate would suppress the new
    // tab and silently keep the user on the current page.
    if (anchor?.target === "_blank") {
      return;
    }

    if (anchor) {
      evt.preventDefault();
    }

    router
      .navigate(options.routeName, resolvedRouteParams, resolvedRouteOptions)
      .catch(() => {});
  }

  element.addEventListener("click", handleClick);

  onCleanup(() => {
    element.removeEventListener("click", handleClick);
  });
}

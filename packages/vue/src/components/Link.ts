import { createActiveSource } from "@real-router/sources";
import { defineComponent, h, computed, shallowRef, watch } from "vue";

import { useRouter } from "../composables/useRouter";
import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
  resolveLinkTarget,
  shallowEqual,
} from "../dom-utils";

import type {
  Params,
  NavigationOptions,
  NavigationTarget,
  SearchParams,
} from "@real-router/core";
import type { PropType } from "vue";

type OnClickHandler = (evt: MouseEvent) => void;

/**
 * Invoke ONE user `@click` handler in isolation (#1352). A throwing handler must
 * NOT skip the Link's own navigation (which `handleClick` runs after this
 * returns) or — in the array form — abort the remaining sibling handlers. Native
 * `<a>` logs a throwing click listener and still performs the default action;
 * this matches the codebase's adapter-callback isolation norm
 * (`RouterErrorBoundary.onError`, `EventEmitter.emit`). The user's own
 * `preventDefault()` still takes effect (it runs before any throw), so the
 * `defaultPrevented` contract below is unchanged.
 */
function invokeUserOnClick(fn: OnClickHandler, evt: MouseEvent): void {
  try {
    fn(evt);
  } catch (error) {
    console.error(
      "[real-router] A <Link> @click handler threw; navigation is unaffected.",
      error,
    );
  }
}

/**
 * Vue's compiled template binds multiple `@click` handlers as an array.
 * Single render-function `onClick` is a function. Both must be invoked, each
 * isolated via `invokeUserOnClick` (#1352).
 *
 * The function-branch deliberately omits a `defaultPrevented` check: the
 * single call short-circuits naturally and control returns to the caller
 * (`handleClick`), which then re-reads `evt.defaultPrevented` on the same
 * MouseEvent. The array-branch needs the per-iteration check because the
 * caller cannot observe intermediate handlers — without it, later handlers
 * would still run after an earlier one called `preventDefault()`.
 */
function invokeAttributesOnClick(value: unknown, evt: MouseEvent): void {
  if (typeof value === "function") {
    invokeUserOnClick(value as OnClickHandler, evt);

    return;
  }
  if (Array.isArray(value)) {
    const handlers = value as OnClickHandler[];

    for (const fn of handlers) {
      if (typeof fn !== "function") {
        continue;
      }

      invokeUserOnClick(fn, evt);

      if (evt.defaultPrevented) {
        return;
      }
    }
  }
}

export const Link = defineComponent({
  name: "Link",
  // Disable Vue's automatic attribute fallthrough. Without this, attrs.onClick
  // (function OR array) is auto-attached as a native click listener AND our
  // explicit onClick fires too — user handlers are double-invoked. We invoke
  // attrs.onClick manually inside handleClick to preserve preventDefault.
  inheritAttrs: false,
  props: {
    // Optional (was required) since the descriptor form (`to`) omits it — the
    // two forms are mutually exclusive, enforced at runtime by resolveLinkTarget.
    routeName: {
      type: String,
      default: undefined,
    },
    // Descriptor form (RFC-4 M2 B2, #1548): `to={{ name, params?, search? }}`,
    // mutually exclusive with the routeName/routeParams/routeSearch channels.
    to: {
      type: Object as PropType<NavigationTarget>,
      default: undefined,
    },
    // Default `undefined` (NOT EMPTY_PARAMS): an omitted `routeParams` must reach
    // `createActiveRouteSource` as `undefined` so it keys the active source as ""
    // and shares ONE cached source (one router subscription) with a manual
    // `useIsActiveRoute(routeName)`. Defaulting to EMPTY_PARAMS ({}) here would key
    // "{}" and split the same logical question into a second eager subscription
    // (#776). Navigation/href default to EMPTY_PARAMS locally where a concrete
    // object is required.
    routeParams: {
      type: Object as PropType<Params>,
      default: undefined,
    },
    // Query (search) channel (RFC-4 M2, #1548) — parallel to routeParams.
    routeSearch: {
      type: Object as PropType<SearchParams>,
      default: undefined,
    },
    routeOptions: {
      type: Object as PropType<NavigationOptions>,
      default: () => EMPTY_OPTIONS,
    },
    class: {
      type: String,
      default: undefined,
    },
    activeClassName: {
      type: String,
      default: "active",
    },
    activeStrict: {
      type: Boolean,
      default: false,
    },
    ignoreQueryParams: {
      type: Boolean,
      default: true,
    },
    target: {
      type: String,
      default: undefined,
    },
    /**
     * URL fragment (decoded form, no leading "#") (#532).
     * - omitted/`undefined` → preserve current fragment on same-route navigation
     * - `""` → clear fragment
     * - non-empty → set fragment
     */
    hash: {
      type: String,
      default: undefined,
    },
  },
  setup(props, { slots, attrs }) {
    const router = useRouter();

    const isActive = shallowRef(false);

    // Content-stable `routeParams` reference. A parent that hands an inline
    // `:routeParams="{ id: 1 }"` literal allocates a fresh object on every
    // render; keying the derivations below off that raw reference would re-run
    // `buildHref` and re-subscribe the ActiveRouteSource on every unrelated
    // parent update. `shallowEqual` collapses structurally-equal params to a
    // stable reference (Object.is per key, order-insensitive — the same
    // contract as the React adapter's Link `memo` comparator), so the `href`
    // computed and the active `watch` bail out until params content actually
    // changes.
    //
    // Hot path on Link-heavy pages: this replaces a per-navigation
    // `canonicalJson` (JSON.stringify + key sort) with a per-navigation
    // `shallowEqual` (no allocation), and lets same-shape navigations skip
    // `buildHref` entirely. Nested-object param VALUES fall back to per-render
    // recompute (shallowEqual compares them by reference) — stabilize with a
    // `ref`/`computed` if it matters, exactly as documented for the React Link.
    // `Params | undefined`: `undefined` (no params) is preserved end-to-end so the
    // active source keys "" (see the `routeParams` prop default note, #776).
    let cachedParams: Params | undefined = props.routeParams;
    const stableParams = computed<Params | undefined>(() => {
      const next = props.routeParams;

      if (!shallowEqual(cachedParams, next)) {
        cachedParams = next;
      }

      return cachedParams;
    });

    // Recreate the ActiveRouteSource ONLY when the Link's identity
    // (routeName / params content / strict / ignoreQueryParams / hash) changes.
    // `stableParams` already absorbs same-content param churn, so this dep
    // array is reference-stable across navigations that don't change shape and
    // the subscription persists.
    watch(
      () =>
        [
          props.routeName,
          stableParams.value,
          props.routeSearch,
          props.to,
          props.activeStrict,
          props.ignoreQueryParams,
          props.hash,
        ] as const,
      (
        [
          routeName,
          routeParams,
          routeSearch,
          to,
          activeStrict,
          ignoreQueryParams,
          hash,
        ],
        _prev,
        onCleanup,
      ) => {
        // Resolve the two prop forms (RFC-4 M2 B2, #1548): `to` supersedes the
        // channel props (dev-warn on conflict).
        const resolved = resolveLinkTarget(
          to,
          routeName ?? "",
          routeParams,
          routeSearch,
        );

        // Hash-aware active (#532): pass hash through so tab links with the
        // same routeName but different `hash` props don't all light up.
        const source = createActiveSource(
          router,
          resolved.name,
          resolved.params,
          resolved.search,
          activeStrict,
          ignoreQueryParams,
          hash,
        );

        isActive.value = source.getSnapshot();

        const unsub = source.subscribe(() => {
          isActive.value = source.getSnapshot();
        });

        onCleanup(unsub);
      },
      { immediate: true, flush: "sync" },
    );

    const href = computed(() => {
      const resolved = resolveLinkTarget(
        props.to,
        props.routeName ?? "",
        stableParams.value,
        props.routeSearch,
      );

      return buildHref(
        router,
        resolved.name,
        resolved.params ?? EMPTY_PARAMS,
        resolved.search,
        props.hash,
      );
    });

    const finalClassName = computed(() =>
      buildActiveClassName(isActive.value, props.activeClassName, props.class),
    );

    const handleClick = (evt: MouseEvent) => {
      // Vue allows attrs.onClick to be a function or an array of functions
      // (compiled templates with multiple @click bindings produce arrays).
      // Both must be invoked; treating arrays as "no handler" silently drops
      // user code.
      if (attrs.onClick !== undefined && attrs.onClick !== null) {
        invokeAttributesOnClick(attrs.onClick, evt);

        if (evt.defaultPrevented) {
          return;
        }
      }

      if (!shouldNavigate(evt) || props.target === "_blank") {
        return;
      }

      evt.preventDefault();

      const resolved = resolveLinkTarget(
        props.to,
        props.routeName ?? "",
        props.routeParams,
        props.routeSearch,
      );

      navigateWithHash(
        router,
        resolved.name,
        resolved.params ?? EMPTY_PARAMS,
        resolved.search,
        props.hash,
        props.routeOptions,
      ).catch(() => {});
    };

    return () => {
      // Build forwarded attrs without `onClick`. Vue's runtime auto-attaches
      // attrs.onClick (function OR array) as a native DOM listener, which would
      // double-invoke user handlers when combined with our explicit `onClick`.
      // We invoke the original attrs.onClick manually inside handleClick so the
      // preventDefault contract is preserved.
      //
      // Spread + delete avoids the per-key copy loop on every render — one
      // allocation + one property deletion instead of N iterations across
      // data-*, aria-*, role, etc. Hot-path optimisation for Link-heavy pages.
      const restAttributes = { ...attrs };

      delete restAttributes.onClick;

      return h(
        "a",
        {
          ...restAttributes,
          href: href.value,
          class: finalClassName.value,
          target: props.target,
          onClick: handleClick,
        },
        slots.default?.(),
      );
    };
  },
});

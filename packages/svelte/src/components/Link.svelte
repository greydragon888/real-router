<script lang="ts">
  import { useIsActiveRoute } from "../composables/useIsActiveRoute.svelte";
  import { useRouter } from "../composables/useRouter.svelte";
  import { EMPTY_OPTIONS, EMPTY_PARAMS, NOOP } from "../constants";
  import {
    shouldNavigate,
    buildHref,
    buildActiveClassName,
    navigateWithHash,
  } from "../dom-utils";

  import type {
    NavigationOptions,
    Params,
    SearchParams,
  } from "@real-router/core";
  import type { Snippet } from "svelte";

  let {
    routeName,
    routeParams,
    routeSearch,
    routeOptions = EMPTY_OPTIONS,
    class: className = undefined,
    activeClassName = "active",
    activeStrict = false,
    ignoreQueryParams = true,
    hash = undefined,
    target = undefined,
    children = undefined,
    onclick: userOnClick = undefined,
    ...restProps
  }: {
    routeName: string;
    routeParams?: Params;
    routeSearch?: SearchParams;
    routeOptions?: NavigationOptions;
    class?: string;
    activeClassName?: string;
    activeStrict?: boolean;
    ignoreQueryParams?: boolean;
    /**
     * URL fragment (decoded form, no leading "#") (#532).
     * - omitted/`undefined` → preserve current fragment on same-route navigation
     * - `""` → clear fragment
     * - non-empty → set fragment
     */
    hash?: string;
    target?: string;
    children?: Snippet;
    onclick?: (evt: MouseEvent) => void;
    [key: string]: unknown;
  } = $props();

  const router = useRouter();
  // Pass `routeParams` straight through (possibly `undefined`) — do NOT default
  // to EMPTY_PARAMS before the active-route call. `createActiveRouteSource` keys
  // `params === undefined` as "" but EMPTY_PARAMS ({}) as "{}", so a no-params
  // `<Link>` and a manual `useIsActiveRoute(routeName)` only share ONE cached
  // source (one router subscription) when both pass `undefined`; defaulting here
  // would split the same question into a second eager subscription (#776).
  //
  // Hash-aware active (#532): tab links sharing routeName but differing in
  // hash should only light up the matching variant.
  // svelte-ignore state_referenced_locally
  // Active-route state is captured at mount; href remains reactive separately.
  const activeState = useIsActiveRoute(
    routeName,
    routeParams,
    routeSearch,
    activeStrict,
    ignoreQueryParams,
    hash,
  );

  // Navigation/href building need a concrete params object — default here only.
  // `routeSearch` stays raw (`undefined` when unset).
  const href = $derived(
    buildHref(
      router,
      routeName,
      routeParams ?? EMPTY_PARAMS,
      routeSearch,
      hash,
    ),
  );

  const finalClassName = $derived(
    buildActiveClassName(activeState.current, activeClassName, className),
  );

  function handleClick(evt: MouseEvent) {
    if (userOnClick) {
      // Isolate a throwing user handler (#1436): native <a> logs a throwing
      // click listener and still performs the default action. Without this the
      // throw escapes before navigateWithHash, silently aborting navigation.
      // The user's own preventDefault() runs before any throw, so the
      // defaultPrevented contract below is unchanged. Mirrors vue's #1352.
      try {
        userOnClick(evt);
      } catch (error) {
        console.error(
          "[real-router] A <Link> onclick handler threw; navigation is unaffected.",
          error,
        );
      }

      if (evt.defaultPrevented) {
        return;
      }
    }

    if (!shouldNavigate(evt) || target === "_blank") {
      return;
    }

    evt.preventDefault();
    navigateWithHash(
      router,
      routeName,
      routeParams ?? EMPTY_PARAMS,
      routeSearch,
      hash,
      routeOptions,
    ).catch(NOOP);
  }
</script>

<a {href} class={finalClassName} {target} onclick={handleClick} {...restProps}>
  {@render children?.()}
</a>

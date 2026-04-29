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

  import type { NavigationOptions, Params } from "@real-router/core";
  import type { Snippet } from "svelte";

  let {
    routeName,
    routeParams = EMPTY_PARAMS,
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
  // Hash-aware active (#532): tab links sharing routeName but differing in
  // hash should only light up the matching variant.
  const activeState = useIsActiveRoute(
    routeName,
    routeParams,
    activeStrict,
    ignoreQueryParams,
    hash,
  );

  const href = $derived(
    buildHref(
      router,
      routeName,
      routeParams,
      hash !== undefined ? { hash } : undefined,
    ),
  );

  const finalClassName = $derived(
    buildActiveClassName(activeState.current, activeClassName, className),
  );

  function handleClick(evt: MouseEvent) {
    if (userOnClick) {
      userOnClick(evt);

      if (evt.defaultPrevented) {
        return;
      }
    }

    if (!shouldNavigate(evt) || target === "_blank") {
      return;
    }

    evt.preventDefault();
    navigateWithHash(router, routeName, routeParams, hash, routeOptions).catch(
      NOOP,
    );
  }
</script>

<a {href} class={finalClassName} {target} onclick={handleClick} {...restProps}>
  {@render children?.()}
</a>

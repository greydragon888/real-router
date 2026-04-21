<script lang="ts">
  import { useIsActiveRoute } from "../composables/useIsActiveRoute.svelte";
  import { useRouter } from "../composables/useRouter.svelte";
  import { EMPTY_OPTIONS, EMPTY_PARAMS, NOOP } from "../constants";
  import {
    shouldNavigate,
    buildHref,
    buildActiveClassName,
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
    target?: string;
    children?: Snippet;
    onclick?: (evt: MouseEvent) => void;
    [key: string]: unknown;
  } = $props();

  const router = useRouter();
  const activeState = useIsActiveRoute(
    routeName,
    routeParams,
    activeStrict,
    ignoreQueryParams,
  );

  const href = $derived(buildHref(router, routeName, routeParams));

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
    router.navigate(routeName, routeParams, routeOptions).catch(NOOP);
  }
</script>

<a {href} class={finalClassName} {target} onclick={handleClick} {...restProps}>
  {@render children?.()}
</a>

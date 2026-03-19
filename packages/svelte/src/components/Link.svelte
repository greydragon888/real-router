<script lang="ts">
  import { useIsActiveRoute } from "../composables/useIsActiveRoute.svelte";
  import { useRouter } from "../composables/useRouter.svelte";
  import { shouldNavigate } from "../utils";

  import type { NavigationOptions, Params } from "@real-router/core";
  import type { Snippet } from "svelte";

  let {
    routeName,
    routeParams = {} as Params,
    routeOptions = {} as NavigationOptions,
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

  const href = $derived(
    typeof router.buildUrl === "function"
      ? router.buildUrl(routeName, routeParams)
      : router.buildPath(routeName, routeParams),
  );

  const finalClassName = $derived(
    activeState.current && activeClassName
      ? className
        ? `${className} ${activeClassName}`.trim()
        : activeClassName
      : className ?? undefined,
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
    router.navigate(routeName, routeParams, routeOptions).catch(() => {});
  }
</script>

<a {href} class={finalClassName} {target} onclick={handleClick} {...restProps}>
  {@render children?.()}
</a>

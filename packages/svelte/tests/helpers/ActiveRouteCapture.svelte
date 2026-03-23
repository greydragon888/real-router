<script lang="ts">
  import { useIsActiveRoute } from "../../src/composables/useIsActiveRoute.svelte";

  import type { Params } from "@real-router/core";

  let {
    routeName,
    routeParams = undefined,
    strict = false,
    ignoreQueryParams = true,
    onCapture,
  }: {
    routeName: string;
    routeParams?: Params;
    strict?: boolean;
    ignoreQueryParams?: boolean;
    onCapture: (result: { readonly current: boolean }) => void;
  } = $props();

  const activeState = useIsActiveRoute(routeName, routeParams, strict, ignoreQueryParams);

  onCapture(activeState);
</script>

<div data-testid="is-active">{String(activeState.current)}</div>

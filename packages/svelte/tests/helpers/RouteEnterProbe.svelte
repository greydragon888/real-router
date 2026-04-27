<script lang="ts">
  import { useRouteEnter } from "../../src/composables/useRouteEnter.svelte";

  import type {
    RouteEnterHandler,
    UseRouteEnterOptions,
  } from "../../src/composables/useRouteEnter.svelte";

  let {
    handler,
    options,
  }: {
    handler: RouteEnterHandler;
    options: UseRouteEnterOptions | undefined;
  } = $props();

  useRouteEnter(handler, options);
</script>

<div data-testid="probe"></div>

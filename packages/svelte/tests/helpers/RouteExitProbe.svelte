<script lang="ts">
  import { useRouteExit } from "../../src/composables/useRouteExit.svelte";

  import type {
    RouteExitHandler,
    UseRouteExitOptions,
  } from "../../src/composables/useRouteExit.svelte";

  let {
    handler,
    options,
  }: {
    handler: RouteExitHandler;
    options: UseRouteExitOptions | undefined;
  } = $props();

  useRouteExit(handler, options);
</script>

<div data-testid="probe"></div>

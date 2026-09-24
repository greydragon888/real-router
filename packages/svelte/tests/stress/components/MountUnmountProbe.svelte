<script lang="ts">
  import MountUnmountProbeChild from "./MountUnmountProbeChild.svelte";
  import RouterProvider from "../../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <MountUnmountProbeChild />
</RouterProvider>

<script lang="ts">
  import { useRouterTransition } from "@real-router/svelte";

  const transition = useRouterTransition();
</script>

{#if transition.current.isTransitioning}
  <div class="progress-bar" style="width: 100%"></div>
{/if}

<script lang="ts">
  import { useRouterTransition } from "../../../src/composables/useRouterTransition.svelte";

  const transition = useRouterTransition();
</script>

<div>{transition.current.isTransitioning ? "t" : "f"}</div>

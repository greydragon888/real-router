<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    fallback?: Snippet;
  }

  let { children, fallback }: Props = $props();

  let mounted = $state(false);

  $effect(() => {
    mounted = true;
  });
</script>

{#if mounted}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if}

<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    fallback?: Snippet;
  }

  let { children, fallback }: Props = $props();

  // eslint-disable-next-line svelte/prefer-writable-derived -- `$effect` runs only in the browser after mount; a `$derived` would be true on the server too
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

<script lang="ts">
  import type { Component } from "svelte";

  let {
    loader,
    fallback,
  }: {
    loader: () => Promise<{ default: Component }>;
    fallback?: Component | undefined;
  } = $props();

  let LoadedComponent = $state<Component | null>(null);
  let error = $state<Error | null>(null);
  let loading = $state(true);

  $effect(() => {
    loading = true;
    error = null;
    LoadedComponent = null;
    let active = true;

    loader()
      .then((module) => {
        if (!active) return;
        LoadedComponent = module.default;
        loading = false;
      })
      .catch((err) => {
        if (!active) return;
        error = err;
        loading = false;
      });

    return () => {
      active = false;
    };
  });
</script>

{#if loading && fallback}
  {@const Fallback = fallback}
  <Fallback />
{:else if error}
  <p>Error loading component: {error.message}</p>
{:else if LoadedComponent}
  <LoadedComponent />
{/if}

<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";
  import type { Snippet } from "svelte";

  let { params, element = "button", children }: { params: LinkActionParams; element?: "button" | "a" | "div"; children?: Snippet } = $props();

  const link = createLinkAction();
</script>

{#if element === "button"}
  <button use:link={params}>
    {@render children?.()}
  </button>
{:else if element === "a"}
  <a href="#" use:link={params}>
    {@render children?.()}
  </a>
{:else}
  <div use:link={params}>
    {@render children?.()}
  </div>
{/if}

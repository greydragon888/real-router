<script lang="ts">
  // Shared layout for /sec/* — holds the sibling nav (reused across a↔b) and
  // renders the active leaf via {@render children()}.
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="sec">
  <nav>
    <a href="/sec/a" data-testid="link-sec-a">A</a>
    <a href="/sec/b" data-testid="link-sec-b">B</a>
  </nav>
  {@render children()}
</div>

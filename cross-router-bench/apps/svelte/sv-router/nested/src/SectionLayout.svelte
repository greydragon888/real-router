<script lang="ts">
  // Shared bottom layout for /sec/…/{a,b} — holds the sibling nav (reused across
  // a↔b) and renders the active leaf via {@render children()}. Nav hrefs point at
  // the DEPTH-deep leaf paths (read from ?n=, matching the router config).
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const _n = Number(
    new URLSearchParams(globalThis.location?.search ?? "").get("n"),
  );
  const DEPTH = _n > 0 ? _n : 1;
  const deepPrefix =
    "/sec" + Array.from({ length: DEPTH - 1 }, (_, i) => `/l${i + 2}`).join("");
</script>

<div class="sec">
  <nav>
    <a href={`${deepPrefix}/a`} data-testid="link-sec-a">A</a>
    <a href={`${deepPrefix}/b`} data-testid="link-sec-b">B</a>
  </nav>
  {@render children()}
</div>

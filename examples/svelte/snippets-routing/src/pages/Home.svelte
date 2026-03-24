<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  const { route } = useRoute();
</script>

<div>
  <h1>Home</h1>
  <p>
    This example demonstrates nested <code>RouteView</code> with named snippets —
    the Svelte 5 pattern for declarative route matching.
  </p>
  <p>
    Current route: <strong>{route.current?.name ?? "—"}</strong>
  </p>
  <p>
    Each <code>RouteView</code> renders the snippet matching the active route segment.
    Use <code>{"{#snippet segmentName()}"}</code> to define what renders for each segment.
  </p>
</div>

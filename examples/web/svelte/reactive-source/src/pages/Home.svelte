<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  const { route } = useRoute();
</script>

<div>
  <h1>Home</h1>
  <p>
    This example demonstrates <code>createReactiveSource</code> — the low-level
    primitive that bridges <code>RouterSource&lt;T&gt;</code> from
    <code>@real-router/sources</code> to Svelte's reactivity system.
  </p>
  <p>
    Current route: <strong>{route.current?.name ?? "—"}</strong>
  </p>
  <p>
    Navigate between pages and watch the monitor panel below update in real-time.
    It uses <code>createRouteSource</code> and <code>createTransitionSource</code>
    directly instead of the higher-level composables.
  </p>
</div>

<script lang="ts">
  // Landing page — reads N back from the query so the driver has a stable
  // page-ready target after the N-route table is built.
  import { route } from "./router";

  const n = new URLSearchParams(window.location.search).get("n") ?? "1";
</script>

<main data-testid="page-ready" data-n={n}>{route.pathname}</main>

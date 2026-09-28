<script lang="ts">
  import { Router } from "sv-router";

  // Side-effect import builds the N-route table before <Router/> renders.
  import "./router";
</script>

<Router />

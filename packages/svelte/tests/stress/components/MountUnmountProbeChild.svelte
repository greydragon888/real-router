<script lang="ts">
  import { useRoute } from "../../../src/composables/useRoute.svelte";
  import { useRouteExit } from "../../../src/composables/useRouteExit.svelte";

  // useRouteExit → router.subscribeLeave (one leave listener per mount)
  // useRoute + reading .current in template → createSubscriber wires
  // router.subscribe through createRouteSource (lazy until template reads).
  const { route } = useRoute();

  useRouteExit(() => {});
</script>

<span data-testid="probe">{route.current.name}</span>

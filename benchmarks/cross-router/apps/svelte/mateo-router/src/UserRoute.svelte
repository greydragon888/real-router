<script lang="ts">
  import { route as routeAction } from "@mateothegreat/svelte5-router";

  import User from "../../_shared/User.svelte";

  // @mateothegreat passes the matched route (RouteResult) as the `route` prop;
  // named regex groups land in route.result.path.params.
  let { route } = $props();
  const id = $derived(String(route.result.path.params.id));
</script>

<User {id} />
<a
  href={`/users/${Number(id) + 1}`}
  use:routeAction
  data-testid="link-user-next"
>
  Next
</a>

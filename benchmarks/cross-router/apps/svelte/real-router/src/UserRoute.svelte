<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  import User from "../../_shared/User.svelte";

  // useRoute() → { route: { current: State } }; `route.current` is reactive, so
  // the param re-reads across a param navigation (same component instance).
  const { route } = useRoute<{ id: string }>();
</script>

<User id={route.current.params.id} />
<Link
  routeName="user"
  routeParams={{ id: String(Number(route.current.params.id) + 1) }}
  data-testid="link-user-next"
>
  Next
</Link>

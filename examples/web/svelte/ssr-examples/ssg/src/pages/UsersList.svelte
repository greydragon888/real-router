<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  import type { UsersListData } from "../router/loaders";

  const EMPTY_DATA: UsersListData = { users: [] };

  const { route } = useRoute();
  const data = $derived(
    (route.current.context.data as UsersListData | undefined) ?? EMPTY_DATA,
  );
</script>

<div>
  <h2>All Users</h2>
  <ul>
    {#each data.users as user (user.id)}
      <li>
        <Link routeName="users.profile" routeParams={{ id: user.id }}>
          {user.name}
        </Link>
      </li>
    {/each}
  </ul>
</div>

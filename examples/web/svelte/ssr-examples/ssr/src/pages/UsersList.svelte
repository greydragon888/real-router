<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  import type { UsersListData } from "../router/loaders";

  const EMPTY_DATA: UsersListData = { users: [], sort: "asc" };

  const { route } = useRoute();
  const data = $derived(
    (route.current.context.data as UsersListData | undefined) ?? EMPTY_DATA,
  );
  const otherSort = $derived(data.sort === "asc" ? "desc" : "asc");
</script>

<svelte:head>
  <title>All Users (sorted {data.sort}) — Real-Router Svelte SSR</title>
</svelte:head>

<div>
  <h2>All Users</h2>
  <p data-testid="current-sort">Sorted: {data.sort}</p>
  <Link
    routeName="users"
    routeParams={{ sort: otherSort }}
    data-testid="toggle-sort"
  >
    Toggle to {otherSort}
  </Link>
  <ul data-testid="users-list">
    {#each data.users as user (user.id)}
      <li data-user-id={user.id}>
        <Link routeName="users.profile" routeParams={{ id: user.id }}>
          {user.name}
        </Link>
        {" — "}
        <span data-testid={`role-${user.id}`}>{user.role}</span>
      </li>
    {/each}
  </ul>
</div>

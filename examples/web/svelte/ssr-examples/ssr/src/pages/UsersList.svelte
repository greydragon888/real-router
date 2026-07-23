<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";
  import { SvelteSet } from "svelte/reactivity";

  import type { UsersListData } from "../router/loaders";

  const EMPTY_DATA: UsersListData = { users: [], sort: "asc" };

  const { route } = useRoute();
  const data = $derived(
    (route.current.context.data as UsersListData | undefined) ?? EMPTY_DATA,
  );
  const otherSort = $derived(data.sort === "asc" ? "desc" : "asc");

  // SvelteSet — reactive Set wrapper. Mutations via .add()/.delete()
  // notify subscribers, so reading `selected.size` (or `selected.has(id)`)
  // inside `$derived`/template re-runs on every change. Equivalent to
  // `$state(new Set())` + manual immutable replacement, but cleaner:
  // mutate-in-place stays reactive without `selected = new Set([...])`.
  // Same family as SvelteMap, SvelteDate, SvelteURL,
  // SvelteURLSearchParams. Client-only state — never serialized to SSR
  // (selection starts empty after hydration regardless of server).
  const selected = new SvelteSet<string>();

  function toggle(userId: string): void {
    if (selected.has(userId)) {
      selected.delete(userId);
    } else {
      selected.add(userId);
    }
  }
</script>

<svelte:head>
  <title>All Users (sorted {data.sort}) — Real-Router Svelte SSR</title>
</svelte:head>

<div>
  <h2>All Users</h2>
  <p data-testid="current-sort">Sorted: {data.sort}</p>
  <p data-testid="selection-count">Selected: {selected.size}</p>
  <Link
    routeName="users"
    routeSearch={{ sort: otherSort }}
    data-testid="toggle-sort"
  >
    Toggle to {otherSort}
  </Link>
  <ul data-testid="users-list">
    {#each data.users as user (user.id)}
      <li data-user-id={user.id}>
        <input
          type="checkbox"
          data-testid={`select-${user.id}`}
          checked={selected.has(user.id)}
          onchange={() => toggle(user.id)}
        />
        <Link routeName="users.profile" routeParams={{ id: user.id }}>
          {user.name}
        </Link>
        {" — "}
        <span data-testid={`role-${user.id}`}>{user.role}</span>
      </li>
    {/each}
  </ul>
</div>

<script lang="ts">
  import { Link, RouteView, useRouteNode } from "@real-router/svelte";
  import type { Snippet } from "svelte";

  const { route } = useRouteNode("users");

  const id = $derived(
    route.current && typeof route.current.params.id === "string"
      ? route.current.params.id
      : null
  );
</script>

<div>
  <h1>Users</h1>
  <p>
    This component uses a nested <code>RouteView nodeName="users"</code> to
    match <code>users.list</code> and <code>users.profile</code> via named snippets.
  </p>

  <RouteView nodeName="users">
    {#snippet list()}
      <div>
        <h2>User List</h2>
        <div class="card">
          <Link routeName="users.profile" routeParams={{ id: "1" }}>User #1 — Alice</Link>
        </div>
        <div class="card">
          <Link routeName="users.profile" routeParams={{ id: "2" }}>User #2 — Bob</Link>
        </div>
        <div class="card">
          <Link routeName="users.profile" routeParams={{ id: "3" }}>User #3 — Carol</Link>
        </div>
      </div>
    {/snippet}
    {#snippet profile()}
      <div>
        <h2>User Profile #{id ?? "?"}</h2>
        <div class="card">
          <p>Profile page for user {id ?? "?"}.</p>
          <p>
            The snippet name <code>profile</code> matches route segment
            <code>users.profile</code>.
          </p>
        </div>
        <Link routeName="users.list">← Back to list</Link>
      </div>
    {/snippet}
  </RouteView>
</div>

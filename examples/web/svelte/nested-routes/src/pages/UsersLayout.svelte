<script lang="ts">
  import { Link, RouteView, useRoute, useRouteNode, useRouteUtils } from "@real-router/svelte";
  import type { Params } from "@real-router/core";
  import UsersList from "./UsersList.svelte";
  import UserProfile from "./UserProfile.svelte";

  const routeLabels: Record<string, string> = {
    home: "Home",
    users: "Users",
    "users.profile.settings": "Settings",
  };

  function getLabel(name: string, params: Params): string {
    if (name in routeLabels) {
      return routeLabels[name];
    }
    if (name === "users.profile") {
      const id = typeof params.id === "string" ? params.id : "?";
      return `User #${id}`;
    }
    return name;
  }

  const { route: globalRoute } = useRoute();
  const utils = useRouteUtils();
  const { route } = useRouteNode("users");
</script>

{#if route.current}
  {@const chain = utils.getChain(globalRoute.current.name) ?? [globalRoute.current.name]}
  {@const crumbs = ["home", ...chain]}
  <nav class="breadcrumbs" aria-label="breadcrumb">
    {#each crumbs as name, i}
      {#if i > 0}<span> › </span>{/if}
      {#if i === crumbs.length - 1}
        <span>{getLabel(name, globalRoute.current.params)}</span>
      {:else}
        <Link routeName={name}>{getLabel(name, globalRoute.current.params)}</Link>
      {/if}
    {/each}
  </nav>

  <!--
    `users` IS the list — no synthetic `list` child / forwardTo. The `self`
    snippet renders UsersList when active route is exactly `users`; the
    `profile` snippet wins for /users/:id and deeper (UserProfile owns its
    own sub-navigation).
  -->
  <div style="margin-top: 16px;">
    <RouteView nodeName="users">
      {#snippet self()}
        <UsersList />
      {/snippet}
      {#snippet profile()}
        <UserProfile />
      {/snippet}
    </RouteView>
  </div>
{/if}

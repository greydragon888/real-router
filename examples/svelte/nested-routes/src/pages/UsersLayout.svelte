<script lang="ts">
  import { Link, RouteView, useRoute, useRouteNode, useRouteUtils } from "@real-router/svelte";
  import type { Params } from "@real-router/core";
  import UsersList from "./UsersList.svelte";
  import UserProfile from "./UserProfile.svelte";
  import UserSettings from "./UserSettings.svelte";

  const routeLabels: Record<string, string> = {
    home: "Home",
    users: "Users",
    "users.list": "List",
    "users.settings": "Settings",
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
  {#if globalRoute.current}
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
  {/if}

  <div style="display: flex; gap: 24px; margin-top: 16px;">
    <nav style="min-width: 140px;">
      <p style="font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px;">
        Users
      </p>
      <Link
        routeName="users.list"
        activeClassName="active"
        style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
      >
        List
      </Link>
      <Link
        routeName="users.settings"
        activeClassName="active"
        style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
      >
        Settings
      </Link>
    </nav>

    <div style="flex: 1;">
      <RouteView nodeName="users">
        {#snippet list()}
          <UsersList />
        {/snippet}
        {#snippet profile()}
          <UserProfile />
        {/snippet}
        {#snippet settings()}
          <UserSettings />
        {/snippet}
      </RouteView>
    </div>
  </div>
{/if}

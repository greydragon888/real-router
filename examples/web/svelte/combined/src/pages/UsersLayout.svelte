<script lang="ts">
  import { Link, RouteView, useRoute, useRouteNode, useRouteUtils } from "@real-router/svelte";
  import type { Params } from "@real-router/core";

  const { route: nodeRoute } = useRouteNode("users");
  const { route } = useRoute();
  const utils = useRouteUtils();

  const routeLabels: Record<string, string> = { home: "Home", users: "Users" };

  function getLabel(name: string, params: Params): string {
    if (name in routeLabels) return routeLabels[name];
    if (name === "users.profile") {
      const id = typeof params.id === "string" ? params.id : "?";
      return `User #${id}`;
    }
    return name;
  }
</script>

{#if nodeRoute.current}
  <div>
    {#if route.current}
      <nav class="breadcrumbs" aria-label="breadcrumb">
        {#each ["home", ...(utils.getChain(route.current.name) ?? [route.current.name])] as name, i}
          {#if i > 0}<span> › </span>{/if}
          {#if i === ["home", ...(utils.getChain(route.current.name) ?? [route.current.name])].length - 1}
            <span>{getLabel(name, route.current.params)}</span>
          {:else}
            <Link routeName={name}>{getLabel(name, route.current.params)}</Link>
          {/if}
        {/each}
      </nav>
    {/if}
    <div style="margin-top: 16px">
      <RouteView nodeName="users">
        {#snippet self()}
          <div>
            <h1>Users</h1>
            <div class="card"><Link routeName="users.profile" routeParams={{ id: "1" }}>User #1 — Alice</Link></div>
            <div class="card"><Link routeName="users.profile" routeParams={{ id: "2" }}>User #2 — Bob</Link></div>
            <div class="card"><Link routeName="users.profile" routeParams={{ id: "3" }}>User #3 — Carol</Link></div>
          </div>
        {/snippet}
        {#snippet profile()}
          {@const id = (nodeRoute.current && typeof nodeRoute.current.params.id === "string") ? nodeRoute.current.params.id : "?"}
          <div>
            <h1>User #{id}</h1>
            <div class="card"><p>Profile for user {id}</p></div>
            <Link routeName="users">← Back to list</Link>
          </div>
        {/snippet}
      </RouteView>
    </div>
  </div>
{/if}

<script lang="ts">
  import { Link, RouteView, RouterProvider } from "@real-router/svelte";

  import Admin from "./pages/Admin.svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Home from "./pages/Home.svelte";
  import NotFound from "./pages/NotFound.svelte";
  import UserProfile from "./pages/UserProfile.svelte";
  import UsersList from "./pages/UsersList.svelte";

  import type { Router } from "@real-router/core";

  const { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <div>
    <nav>
      <Link routeName="home">Home</Link>
      {" | "}
      <Link routeName="users">Users</Link>
      {" | "}
      <Link routeName="dashboard">Dashboard</Link>
      {" | "}
      <Link routeName="admin" data-testid="nav-admin">Admin</Link>
    </nav>
    <main>
      <RouteView nodeName="">
        {#snippet home()}
          <Home />
        {/snippet}
        {#snippet users()}
          <h1>Users</h1>
          <RouteView nodeName="users">
            {#snippet self()}
              <UsersList />
            {/snippet}
            {#snippet profile()}
              <UserProfile />
            {/snippet}
          </RouteView>
        {/snippet}
        {#snippet dashboard()}
          <Dashboard />
        {/snippet}
        {#snippet admin()}
          <Admin />
        {/snippet}
        {#snippet notFound()}
          <NotFound />
        {/snippet}
      </RouteView>
    </main>
  </div>
</RouterProvider>

<script lang="ts">
  import { getRoutesApi } from "@real-router/core/api";
  import { RouterProvider, RouteView, Link, useRoute, useNavigator } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Home from "./pages/Home.svelte";
  import About from "./pages/About.svelte";
  import Analytics from "./pages/Analytics.svelte";
  import Admin from "./pages/Admin.svelte";
  import { analyticsRoute, adminRoutes } from "./routes";

  let { router }: { router: Router } = $props();

  let analyticsEnabled = $state(false);
  let adminEnabled = $state(false);
</script>

<RouterProvider {router}>
  {@const { route } = useRoute()}
  {@const navigator = useNavigator()}
  {@const routesApi = getRoutesApi(router)}
  <div class="app">
    <header class="header">Real-Router — Dynamic Routes</header>
    <aside class="sidebar">
      <Link routeName="home" activeClassName="active">Home</Link>
      <Link routeName="about" activeClassName="active">About</Link>
      {#if analyticsEnabled}
        <Link routeName="analytics" activeClassName="active">Analytics</Link>
      {/if}
      {#if adminEnabled}
        <Link routeName="admin" activeClassName="active">Admin</Link>
        <Link routeName="admin.users" activeClassName="active" style="padding-left: 36px">Users</Link>
        <Link routeName="admin.settings" activeClassName="active" style="padding-left: 36px">Settings</Link>
      {/if}

      <div style="padding: 16px 24px; border-top: 1px solid #e0e0e0; margin-top: 8px">
        <strong style="font-size: 12px; color: #888; display: block; margin-bottom: 8px">
          FEATURE FLAGS
        </strong>
        <div class="toggle">
          <input
            id="analytics-toggle"
            type="checkbox"
            checked={analyticsEnabled}
            onchange={async () => {
              if (analyticsEnabled) {
                if (route.current?.name.startsWith("analytics")) {
                  await navigator.navigate("home");
                }
                routesApi.remove("analytics");
                analyticsEnabled = false;
              } else {
                routesApi.add(analyticsRoute);
                analyticsEnabled = true;
              }
            }}
          />
          <label for="analytics-toggle">Analytics</label>
        </div>
        <div class="toggle">
          <input
            id="admin-toggle"
            type="checkbox"
            checked={adminEnabled}
            onchange={async () => {
              if (adminEnabled) {
                if (route.current?.name.startsWith("admin")) {
                  await navigator.navigate("home");
                }
                routesApi.remove("admin");
                adminEnabled = false;
              } else {
                routesApi.add(adminRoutes);
                adminEnabled = true;
              }
            }}
          />
          <label for="admin-toggle">Admin Panel</label>
        </div>
      </div>
    </aside>

    <main class="content">
      <div class="card" style="margin-bottom: 16px; font-size: 13px">
        <strong>Active route tree</strong>
        <pre style="margin-top: 8px; color: #444; line-height: 1.6">{[
          "home (/)",
          "about (/about)",
          ...(analyticsEnabled ? ["analytics (/analytics)"] : []),
          ...(adminEnabled ? ["admin (/admin)", "  admin.users (/users)", "  admin.settings (/settings)"] : []),
        ].join("\n")}</pre>
      </div>
      <RouteView nodeName="">
        {#snippet home()}
          <Home />
        {/snippet}
        {#snippet about()}
          <About />
        {/snippet}
        {#if analyticsEnabled}
          {#snippet analytics()}
            <Analytics />
          {/snippet}
        {/if}
        {#if adminEnabled}
          {#snippet admin()}
            <Admin />
          {/snippet}
        {/if}
        {#snippet notFound()}
          <h1>404 — Page Not Found</h1>
        {/snippet}
      </RouteView>
    </main>
    <footer class="footer">@real-router/svelte</footer>
  </div>
</RouterProvider>

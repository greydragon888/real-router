<script lang="ts">
  import { RouteView } from "@real-router/svelte";
  import AdminUsers from "./AdminUsers.svelte";
  import AdminSettings from "./AdminSettings.svelte";
</script>

<div>
  <h1>Admin</h1>
  <RouteView nodeName="admin">
    {#snippet users()}
      <AdminUsers />
    {/snippet}
    {#snippet settings()}
      <AdminSettings />
    {/snippet}
    {#snippet notFound()}
      <p>
        Use the sidebar links to navigate to Admin Users or Admin Settings.
      </p>
    {/snippet}
  </RouteView>
</div>

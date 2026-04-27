<script lang="ts">
  import { Link, RouteView, useRouteNode } from "@real-router/svelte";
  import UserSettings from "./UserSettings.svelte";

  const userData: Record<string, { name: string; role: string; email: string }> = {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

  const { route } = useRouteNode("users.profile");

  const id = $derived(
    route.current && typeof route.current.params.id === "string"
      ? route.current.params.id
      : "",
  );
  const user = $derived(id ? userData[id] : undefined);
  const displayName = $derived(user?.name ?? `User ${id || "?"}`);
</script>

<div>
  <h1>{displayName}</h1>

  <div style="display: flex; gap: 24px; margin-top: 16px;">
    <nav style="min-width: 140px;">
      <p style="font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px;">
        {displayName}
      </p>
      <Link
        routeName="users.profile"
        routeParams={{ id }}
        activeStrict
        activeClassName="active"
        style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
      >
        Profile
      </Link>
      <Link
        routeName="users.profile.settings"
        routeParams={{ id }}
        activeClassName="active"
        style="display: block; padding: 6px 12px; text-decoration: none; color: #555; border-radius: 4px;"
      >
        Settings
      </Link>
    </nav>

    <div style="flex: 1;">
      <!--
        `users.profile` IS the profile-info page. The `self` snippet renders
        ProfileDetails when active is exactly `users.profile`; `settings`
        snippet wins for /users/:id/settings.
      -->
      <RouteView nodeName="users.profile">
        {#snippet self()}
          {#if !user}
            <div>
              <h2>User Not Found</h2>
              <p>No user with ID {id}.</p>
            </div>
          {:else}
            <div class="card">
              <p><strong>Role:</strong> {user.role}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>ID:</strong> {id}</p>
            </div>
          {/if}
        {/snippet}
        {#snippet settings()}
          <UserSettings />
        {/snippet}
      </RouteView>
    </div>
  </div>
</div>

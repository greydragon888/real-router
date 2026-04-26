<script setup lang="ts">
import { Link, RouteView, useRouteNode } from "@real-router/vue";
import { computed } from "vue";

import UserSettings from "./UserSettings.vue";

const userData: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

const { route } = useRouteNode("users.profile");

const id = computed(() => {
  if (route.value && typeof route.value.params.id === "string") {
    return route.value.params.id;
  }

  return "";
});

const user = computed(() => (id.value ? userData[id.value] : undefined));

const displayName = computed(() => user.value?.name ?? `User ${id.value || "?"}`);
</script>

<template>
  <div>
    <h1>{{ displayName }}</h1>

    <div :style="{ display: 'flex', gap: '24px', marginTop: '16px' }">
      <nav :style="{ minWidth: '140px' }">
        <p
          :style="{
            fontSize: '12px',
            textTransform: 'uppercase',
            color: '#888',
            marginBottom: '8px',
          }"
        >
          {{ displayName }}
        </p>
        <Link
          routeName="users.profile"
          :routeParams="{ id }"
          activeStrict
          activeClassName="active"
          :style="{
            display: 'block',
            padding: '6px 12px',
            textDecoration: 'none',
            color: '#555',
            borderRadius: '4px',
          }"
        >
          Profile
        </Link>
        <Link
          routeName="users.profile.settings"
          :routeParams="{ id }"
          activeClassName="active"
          :style="{
            display: 'block',
            padding: '6px 12px',
            textDecoration: 'none',
            color: '#555',
            borderRadius: '4px',
          }"
        >
          Settings
        </Link>
      </nav>

      <div :style="{ flex: 1 }">
        <!--
          `users.profile` IS the profile-info page. Self renders profile
          details; settings Match wins for /users/:id/settings.
        -->
        <RouteView nodeName="users.profile">
          <RouteView.Self>
            <div v-if="!user">
              <h2>User Not Found</h2>
              <p>No user with ID {{ id }}.</p>
            </div>
            <div v-else class="card">
              <p><strong>Role:</strong> {{ user.role }}</p>
              <p><strong>Email:</strong> {{ user.email }}</p>
              <p><strong>ID:</strong> {{ id }}</p>
            </div>
          </RouteView.Self>
          <RouteView.Match segment="settings">
            <UserSettings />
          </RouteView.Match>
        </RouteView>
      </div>
    </div>
  </div>
</template>

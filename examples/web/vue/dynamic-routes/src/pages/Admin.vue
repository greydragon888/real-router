<script setup lang="ts">
import { RouteView } from "@real-router/vue";
import AdminSettings from "./AdminSettings.vue";
import AdminUsers from "./AdminUsers.vue";
</script>

<template>
  <div>
    <h1>Admin</h1>
    <RouteView nodeName="admin">
      <RouteView.Match segment="users">
        <AdminUsers />
      </RouteView.Match>
      <RouteView.Match segment="settings">
        <AdminSettings />
      </RouteView.Match>
      <RouteView.NotFound>
        <p>
          Use the sidebar links to navigate to Admin Users or Admin Settings.
        </p>
      </RouteView.NotFound>
    </RouteView>
  </div>
</template>

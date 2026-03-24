<script setup lang="ts">
import { useRouteNode } from "@real-router/vue";
import { computed } from "vue";

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
</script>

<template>
  <div v-if="!user">
    <h1>User Not Found</h1>
    <p>No user with ID {{ id }}.</p>
  </div>
  <div v-else>
    <h1>{{ user.name }}</h1>
    <div class="card">
      <p><strong>Role:</strong> {{ user.role }}</p>
      <p><strong>Email:</strong> {{ user.email }}</p>
      <p><strong>ID:</strong> {{ id }}</p>
    </div>
    <p>
      Notice that <strong>Users</strong> in the outer sidebar remains active
      (ancestor matching) while you browse profiles.
    </p>
  </div>
</template>

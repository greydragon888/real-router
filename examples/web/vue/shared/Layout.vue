<script setup lang="ts">
import { Link } from "@real-router/vue";

interface NavLink {
  routeName: string;
  label: string;
}

defineProps<{
  title: string;
  links: NavLink[];
}>();
</script>

<template>
  <div class="app">
    <header class="header">{{ title }}</header>
    <aside class="sidebar">
      <Link
        v-for="link in links"
        :key="link.routeName"
        :routeName="link.routeName"
        activeClassName="active"
      >
        {{ link.label }}
      </Link>
    </aside>
    <main class="content">
      <slot />
    </main>
    <footer class="footer">@real-router/vue</footer>
  </div>
</template>

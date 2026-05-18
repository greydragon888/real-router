<script setup lang="ts">
import { Link } from "@real-router/vue";
</script>

<template>
  <section data-testid="not-found">
    <h1>404 — Not Found</h1>
    <p><Link routeName="home">Go home</Link></p>
  </section>
</template>

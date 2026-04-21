<script setup lang="ts">
import { useRoute } from "@real-router/vue";

const { route } = useRoute();
const items = Array.from({ length: 100 }, (_, i) => i + 1);
</script>

<template>
  <div>
    <h1>Home</h1>
    <p>Welcome to the Real-Router basic example.</p>
    <p>
      Current route: <strong>{{ route?.name ?? "—" }}</strong>
    </p>
    <p>
      Use the sidebar to navigate between pages. Try clicking <em>Back</em> and
      <em>Forward</em> in the browser — routing state is preserved in the URL.
    </p>
    <p>
      <strong>Scroll restoration demo:</strong> scroll down the list below,
      navigate to About, then hit Back — your position is restored.
    </p>
    <ul>
      <li v-for="n in items" :key="n">Item #{{ n }}</li>
    </ul>
  </div>
</template>

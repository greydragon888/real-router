<script setup lang="ts">
import { useRouter, useRoute } from "@real-router/vue";

const router = useRouter();
const { route } = useRoute();
</script>

<template>
  <div>
    <h1>Home</h1>
    <p>
      This app uses <code>app.use(createRouterPlugin(router))</code> instead of
      <code>&lt;RouterProvider&gt;</code>. Both approaches work identically.
    </p>
    <div class="card">
      <p>
        <strong>Router installed via:</strong> <code>app.use()</code> plugin
        pattern
      </p>
      <p><strong>Current route:</strong> {{ route?.name ?? "—" }}</p>
      <p>
        <strong>Router has routes:</strong>
        {{ router.getState() !== null ? "Yes" : "No" }}
      </p>
    </div>
    <p>
      All composables (<code>useRouter</code>, <code>useRoute</code>,
      <code>useNavigator</code>, etc.) and the <code>v-link</code> directive
      work without wrapping in <code>&lt;RouterProvider&gt;</code>.
    </p>
  </div>
</template>

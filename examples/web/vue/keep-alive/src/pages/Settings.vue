<script setup lang="ts">
import { onActivated, onDeactivated, ref } from "vue";

const log = ref<string[]>([]);

onActivated(() => {
  log.value = [
    ...log.value,
    `onActivated — ${new Date().toLocaleTimeString()}`,
  ];
});

onDeactivated(() => {
  log.value = [
    ...log.value,
    `onDeactivated — ${new Date().toLocaleTimeString()}`,
  ];
});
</script>

<template>
  <div>
    <h1>Settings</h1>
    <p>
      Navigate to Dashboard — your form data there will be preserved because of
      <code>keepAlive</code>.
    </p>
    <div class="card">
      <div class="form-group">
        <label>Notification Preferences</label>
        <select>
          <option value="all" selected>All notifications</option>
          <option value="mentions">Mentions only</option>
          <option value="none">None</option>
        </select>
      </div>
    </div>

    <div class="card" :style="{ marginTop: '16px' }">
      <strong>Lifecycle log</strong>
      <ul
        v-if="log.length > 0"
        :style="{ paddingLeft: '16px', fontSize: '13px' }"
      >
        <li v-for="(entry, i) in log" :key="i">{{ entry }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, ref } from "vue";

const search = ref("");
const log = ref<string[]>([]);

const items = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  label: `Item #${i + 1}`,
  value: Math.floor(Math.random() * 1000),
}));

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
    <h1>Dashboard</h1>
    <p>
      This component uses <code>keepAlive</code> — state is preserved across
      navigations. Try typing in the search box, then navigate to Settings and
      back.
    </p>

    <div class="form-group">
      <label>Search</label>
      <input
        v-model="search"
        placeholder="Type here — preserved on navigation"
      />
    </div>

    <div
      class="card"
      :style="{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto' }"
    >
      <table :style="{ width: '100%' }">
        <thead>
          <tr>
            <th>ID</th>
            <th>Label</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items.filter((i) =>
              i.label.toLowerCase().includes(search.toLowerCase()),
            )"
            :key="item.id"
          >
            <td>{{ item.id }}</td>
            <td>{{ item.label }}</td>
            <td>{{ item.value }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" :style="{ marginTop: '16px' }">
      <strong>Lifecycle log</strong>
      <p v-if="log.length === 0" :style="{ color: '#888', fontSize: '13px' }">
        Navigate away and back to see onActivated/onDeactivated.
      </p>
      <ul v-else :style="{ paddingLeft: '16px', fontSize: '13px' }">
        <li v-for="(entry, i) in log" :key="i">{{ entry }}</li>
      </ul>
    </div>
  </div>
</template>

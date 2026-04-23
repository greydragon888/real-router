<script setup lang="ts">
import { ref } from "vue";
import { api } from "../../../../shared/api";

import type { User } from "../../../../shared/api";

const emit = defineEmits<{
  login: [user: User];
}>();

const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const loading = ref(false);

async function handleSubmit() {
  error.value = null;
  loading.value = true;
  try {
    const user = await api.login(email.value, password.value);

    if (!user) {
      error.value =
        "Invalid credentials. Try alice@example.com or bob@example.com";

      return;
    }

    emit("login", user);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <h1>Login</h1>
    <form @submit.prevent="handleSubmit()">
      <div class="form-group">
        <label>Email</label>
        <input
          type="email"
          v-model="email"
          placeholder="alice@example.com"
          required
        />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input
          type="password"
          v-model="password"
          placeholder="any password"
          required
        />
      </div>
      <div v-if="error" class="toast error">{{ error }}</div>
      <button type="submit" class="primary" :disabled="loading">
        {{ loading ? "Logging in…" : "Login" }}
      </button>
    </form>
    <div class="card" :style="{ marginTop: '16px' }">
      <p><strong>Try these accounts:</strong></p>
      <p>alice@example.com — Admin (access to all routes)</p>
      <p>bob@example.com — Editor (no Admin page)</p>
      <p>carol@example.com — Viewer (no Admin page)</p>
      <p>Any password works in this demo.</p>
    </div>
  </div>
</template>

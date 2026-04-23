<script lang="ts">
  import { api } from "../../../../shared/api";
  import type { User } from "../../../../shared/api";

  let { onLogin }: { onLogin: (user: User) => Promise<void> } = $props();

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    error = null;
    loading = true;
    try {
      const user = await api.login(email, password);
      if (!user) {
        error = "Invalid credentials. Try alice@example.com or bob@example.com";
        return;
      }
      await onLogin(user);
    } finally {
      loading = false;
    }
  };
</script>

<div>
  <h1>Login</h1>
  <form onsubmit={(event) => void handleSubmit(event)}>
    <div class="form-group">
      <label>Email</label>
      <input type="email" value={email} oninput={(e) => { email = e.currentTarget.value; }} placeholder="alice@example.com" required />
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" value={password} oninput={(e) => { password = e.currentTarget.value; }} placeholder="any password" required />
    </div>
    {#if error}<div class="toast error">{error}</div>{/if}
    <button type="submit" class="primary" disabled={loading}>{loading ? "Logging in…" : "Login"}</button>
  </form>
  <div class="card" style="margin-top: 16px">
    <p><strong>Try these accounts:</strong></p>
    <p>alice@example.com — Admin</p>
    <p>bob@example.com — Editor</p>
    <p>carol@example.com — Viewer</p>
    <p>Any password works.</p>
  </div>
</div>

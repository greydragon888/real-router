import { createSignal, Show } from "solid-js";

import { api } from "../../../../shared/api";

import type { User } from "../../../../shared/api";
import type { JSX } from "solid-js";

interface LoginProps {
  readonly onLogin: (user: User) => Promise<void>;
}

export function Login(props: LoginProps): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.login(email(), password());

      if (!user) {
        setError(
          "Invalid credentials. Try alice@example.com or bob@example.com",
        );

        return;
      }

      await props.onLogin(user);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div class="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email()}
            onInput={(event) => {
              setEmail(event.target.value);
            }}
            placeholder="alice@example.com"
            required
          />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password()}
            onInput={(event) => {
              setPassword(event.target.value);
            }}
            placeholder="any password"
            required
          />
        </div>
        <Show when={error()}>
          <div class="toast error">{error()}</div>
        </Show>
        <button type="submit" class="primary" disabled={loading()}>
          {loading() ? "Logging in…" : "Login"}
        </button>
      </form>
      <div class="card" style={{ "margin-top": "16px" }}>
        <p>
          <strong>Try these accounts:</strong>
        </p>
        <p>alice@example.com — Admin</p>
        <p>bob@example.com — Editor</p>
        <p>carol@example.com — Viewer</p>
        <p>Any password works.</p>
      </div>
    </div>
  );
}

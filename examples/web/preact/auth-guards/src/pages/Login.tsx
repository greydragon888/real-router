import { useState } from "preact/hooks";

import { api } from "../../../../shared/api";

import type { User } from "../../../../shared/api";
import type { JSX } from "preact";

interface LoginProps {
  readonly onLogin: (user: User) => Promise<void>;
}

export function Login({ onLogin }: LoginProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await api.login(email, password);

      if (!user) {
        setError(
          "Invalid credentials. Try alice@example.com or bob@example.com",
        );

        return;
      }

      await onLogin(user);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail((event.target as HTMLInputElement).value);
            }}
            placeholder="alice@example.com"
            required
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword((event.target as HTMLInputElement).value);
            }}
            placeholder="any password"
            required
          />
        </div>
        {error && <div className="toast error">{error}</div>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
      <div className="card" style={{ marginTop: "16px" }}>
        <p>
          <strong>Try these accounts:</strong>
        </p>
        <p>alice@example.com — Admin (access to all routes)</p>
        <p>bob@example.com — Editor (no Admin page)</p>
        <p>carol@example.com — Viewer (no Admin page)</p>
        <p>Any password works in this demo.</p>
      </div>
    </div>
  );
}

import { Component, output, signal } from "@angular/core";

import { api } from "../../../../../shared/api";

import type { User } from "../../../../../shared/api";

@Component({
  selector: "login-page",
  template: `
    <div>
      <h1>Login</h1>
      <form (submit)="handleSubmit($event)">
        <div class="form-group">
          <label>Email</label>
          <input
            type="email"
            [value]="email()"
            (input)="email.set($any($event.target).value)"
            placeholder="alice@example.com"
            required
          />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input
            type="password"
            [value]="password()"
            (input)="password.set($any($event.target).value)"
            placeholder="any password"
            required
          />
        </div>
        @if (error()) {
          <div class="toast error">{{ error() }}</div>
        }
        <button type="submit" class="primary" [disabled]="loading()">
          {{ loading() ? "Logging in…" : "Login" }}
        </button>
      </form>
      <div class="card" style="margin-top: 16px;">
        <p><strong>Try these accounts:</strong></p>
        <p>alice&#64;example.com — Admin</p>
        <p>bob&#64;example.com — Editor</p>
        <p>carol&#64;example.com — Viewer</p>
        <p>Any password works.</p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  readonly login = output<User>();

  readonly email = signal("");
  readonly password = signal("");
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  async handleSubmit(event: Event) {
    event.preventDefault();
    this.error.set(null);
    this.loading.set(true);
    try {
      const user = await api.login(this.email(), this.password());

      if (!user) {
        this.error.set(
          "Invalid credentials. Try alice@example.com or bob@example.com",
        );
        return;
      }

      this.login.emit(user);
    } finally {
      this.loading.set(false);
    }
  }
}

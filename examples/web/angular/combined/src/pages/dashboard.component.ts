import { Component, computed, effect, output, signal } from "@angular/core";
import { injectNavigator, injectRoute } from "@real-router/angular";

import { store } from "../../../../../shared/store";

import type { User } from "../../../../../shared/api";

@Component({
  selector: "dashboard-page",
  template: `
    <div>
      <h1>Dashboard</h1>
      @if (user(); as u) {
        <div class="card">
          <p><strong>Logged in as:</strong> {{ u.name }}</p>
          <p><strong>Role:</strong> {{ u.role }}</p>
          <p><strong>Lang param:</strong> {{ lang() }}</p>
        </div>
      }
      <div style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
        <button (click)="toggleLang()">
          Toggle lang ({{ lang() === "en" ? "→ RU" : "→ EN" }})
        </button>
        <button class="danger" (click)="logout.emit()">Logout</button>
      </div>
      <p style="margin-top: 16px; font-size: 14px; color: #888;">
        This page loads lazily — chunk loaded on first visit.
      </p>
    </div>
  `,
})
export class DashboardComponent {
  readonly logout = output();

  private readonly state = injectRoute();
  private readonly navigator = injectNavigator();

  readonly user = signal<User | null>(store.get("user") as User | null);

  readonly lang = computed<string>(() => {
    const search = this.state.routeState().route.search;
    const value = search?.lang;

    return typeof value === "string" ? value : "en";
  });

  constructor() {
    const unsub = store.subscribe(() => {
      this.user.set(store.get("user") as User | null);
    });

    effect((onCleanup) => {
      onCleanup(() => {
        unsub();
      });
    });
  }

  toggleLang(): void {
    const current = this.state.routeState().route;

    if (!current) {
      return;
    }

    void this.navigator.navigate(
      current.name,
      current.params,
      {
        ...current.search,
        lang: this.lang() === "en" ? "ru" : "en",
      },
      { reload: true },
    );
  }
}

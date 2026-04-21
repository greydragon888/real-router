import { Component, signal } from "@angular/core";
import {
  injectNavigator,
  injectRoute,
  injectRouter,
  RealLink,
  RouteMatch,
  RouteNotFound,
  RouteView,
} from "@real-router/angular";
import { getRoutesApi } from "@real-router/core/api";

import { AboutComponent } from "./pages/about.component";
import { AdminComponent } from "./pages/admin.component";
import { AnalyticsComponent } from "./pages/analytics.component";
import { HomeComponent } from "./pages/home.component";
import { adminRoutes, analyticsRoute } from "./routes";

@Component({
  selector: "app-root",
  imports: [
    RealLink,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    AboutComponent,
    AnalyticsComponent,
    AdminComponent,
  ],
  template: `
    <div class="app">
      <header class="header">Real-Router — Dynamic Routes</header>
      <aside class="sidebar">
        <a realLink routeName="home" activeClassName="active">Home</a>
        <a realLink routeName="about" activeClassName="active">About</a>
        @if (analyticsEnabled()) {
          <a realLink routeName="analytics" activeClassName="active">
            Analytics
          </a>
        }
        @if (adminEnabled()) {
          <a realLink routeName="admin" activeClassName="active">Admin</a>
          <a
            realLink
            routeName="admin.users"
            activeClassName="active"
            style="padding-left: 36px;"
          >
            Users
          </a>
          <a
            realLink
            routeName="admin.settings"
            activeClassName="active"
            style="padding-left: 36px;"
          >
            Settings
          </a>
        }

        <div
          style="padding: 16px 24px; border-top: 1px solid #e0e0e0; margin-top: 8px;"
        >
          <strong
            style="font-size: 12px; color: #888; display: block; margin-bottom: 8px;"
          >
            FEATURE FLAGS
          </strong>
          <div class="toggle">
            <input
              id="analytics-toggle"
              type="checkbox"
              [checked]="analyticsEnabled()"
              (change)="toggleAnalytics()"
            />
            <label for="analytics-toggle">Analytics</label>
          </div>
          <div class="toggle">
            <input
              id="admin-toggle"
              type="checkbox"
              [checked]="adminEnabled()"
              (change)="toggleAdmin()"
            />
            <label for="admin-toggle">Admin Panel</label>
          </div>
        </div>
      </aside>

      <main class="content">
        <div class="card" style="margin-bottom: 16px; font-size: 13px;">
          <strong>Active route tree</strong>
          <pre style="margin-top: 8px; color: #444; line-height: 1.6;">{{
            routeTree()
          }}</pre>
        </div>
        <route-view [routeNode]="''">
          <ng-template routeMatch="home"><home-page /></ng-template>
          <ng-template routeMatch="about"><about-page /></ng-template>
          @if (analyticsEnabled()) {
            <ng-template routeMatch="analytics"><analytics-page /></ng-template>
          }
          @if (adminEnabled()) {
            <ng-template routeMatch="admin"><admin-page /></ng-template>
          }
          <ng-template routeNotFound>
            <h1>404 — Page Not Found</h1>
          </ng-template>
        </route-view>
      </main>
      <footer class="footer">&#64;real-router/angular</footer>
    </div>
  `,
})
export class AppComponent {
  private readonly router = injectRouter();
  private readonly navigator = injectNavigator();
  private readonly route = injectRoute();
  private readonly routesApi = getRoutesApi(this.router);

  readonly analyticsEnabled = signal(false);
  readonly adminEnabled = signal(false);

  readonly routeTree = () => {
    const lines = ["home (/)", "about (/about)"];
    if (this.analyticsEnabled()) lines.push("analytics (/analytics)");
    if (this.adminEnabled()) {
      lines.push(
        "admin (/admin)",
        "  admin.users (/users)",
        "  admin.settings (/settings)",
      );
    }
    return lines.join("\n");
  };

  async toggleAnalytics(): Promise<void> {
    if (this.analyticsEnabled()) {
      if (this.route.routeState().route?.name.startsWith("analytics")) {
        await this.navigator.navigate("home");
      }
      this.routesApi.remove("analytics");
      this.analyticsEnabled.set(false);
    } else {
      this.routesApi.add(analyticsRoute);
      this.analyticsEnabled.set(true);
    }
  }

  async toggleAdmin(): Promise<void> {
    if (this.adminEnabled()) {
      if (this.route.routeState().route?.name.startsWith("admin")) {
        await this.navigator.navigate("home");
      }
      this.routesApi.remove("admin");
      this.adminEnabled.set(false);
    } else {
      this.routesApi.add(adminRoutes);
      this.adminEnabled.set(true);
    }
  }
}

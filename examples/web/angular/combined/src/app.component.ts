import { Component, computed, effect, inject, signal } from "@angular/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import {
  injectNavigator,
  NavigationAnnouncer,
  RealLink,
  ROUTER,
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { ProgressBarComponent } from "./components/progress-bar.component";
import { AdminComponent } from "./pages/admin.component";
import { CheckoutComponent } from "./pages/checkout.component";
import { DashboardComponent } from "./pages/dashboard.component";
import { HomeComponent } from "./pages/home.component";
import { LoginComponent } from "./pages/login.component";
import { ProductDetailComponent } from "./pages/product-detail.component";
import { ProductsListComponent } from "./pages/products-list.component";
import { SettingsComponent } from "./pages/settings.component";
import { UsersLayoutComponent } from "./pages/users-layout.component";
import { privateRoutes, publicRoutes } from "./routes";

import { defineAbilities } from "../../../../shared/abilities";
import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";
import type { AppDependencies } from "./types";
import type { Router } from "@real-router/core";

const PRIVATE_LINKS = [
  { routeName: "dashboard", label: "Dashboard" },
  { routeName: "products", label: "Products" },
  { routeName: "users", label: "Users" },
  { routeName: "settings", label: "Settings" },
  { routeName: "admin", label: "Admin" },
  { routeName: "checkout", label: "Checkout" },
];

const PUBLIC_LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "login", label: "Login" },
];

@Component({
  selector: "app-root",
  imports: [
    NavigationAnnouncer,
    RealLink,
    RouteMatch,
    RouteNotFound,
    RouteSelf,
    RouteView,
    ProgressBarComponent,
    AdminComponent,
    CheckoutComponent,
    DashboardComponent,
    HomeComponent,
    LoginComponent,
    ProductDetailComponent,
    ProductsListComponent,
    SettingsComponent,
    UsersLayoutComponent,
  ],
  template: `
    <div class="app">
      <navigation-announcer />
      <header class="header">Real-Router — Combined</header>
      <aside class="sidebar">
        @for (link of links(); track link.routeName) {
          <a
            realLink
            [routeName]="link.routeName"
            [ignoreQueryParams]="true"
            activeClassName="active"
          >
            {{ link.label }}
          </a>
        }
      </aside>
      <main class="content">
        <progress-bar />
        <route-view [routeNode]="''">
          <ng-template routeMatch="home"><home-page /></ng-template>
          <ng-template routeMatch="login">
            <login-page (login)="onLogin($event)" />
          </ng-template>
          <ng-template routeMatch="dashboard">
            <dashboard-page (logout)="onLogout()" />
          </ng-template>
          <ng-template routeMatch="products">
            <route-view [routeNode]="'products'">
              <ng-template routeSelf><products-list /></ng-template>
              <ng-template routeMatch="detail"><product-detail /></ng-template>
            </route-view>
          </ng-template>
          <ng-template routeMatch="users"><users-layout /></ng-template>
          <ng-template routeMatch="settings"><settings-page /></ng-template>
          <ng-template routeMatch="admin"><admin-page /></ng-template>
          <ng-template routeMatch="checkout"><checkout-page /></ng-template>
          <ng-template routeNotFound>
            <h1>404 — Page Not Found</h1>
            <p>The page you are looking for does not exist.</p>
            <p>Try logging in — available routes change based on auth state.</p>
          </ng-template>
        </route-view>
      </main>
      <footer class="footer">&#64;real-router/angular</footer>
    </div>
  `,
})
export class AppComponent {
  private readonly router = inject(ROUTER) as Router<AppDependencies>;
  private readonly navigator = injectNavigator();

  readonly user = signal<User | null>(store.get("user") as User | null);

  readonly links = computed(() => (this.user() ? PRIVATE_LINKS : PUBLIC_LINKS));

  constructor() {
    const unsub = store.subscribe(() => {
      this.user.set(store.get("user") as User | null);
    });

    effect((onCleanup) => {
      onCleanup(() => unsub());
    });
  }

  async onLogin(user: User): Promise<void> {
    store.set("user", user);
    getDependenciesApi(this.router).set(
      "abilities",
      defineAbilities(user.role),
    );
    const routesApi = getRoutesApi(this.router);

    routesApi.clear();
    routesApi.add(privateRoutes);
    await this.navigator.navigate("dashboard");
  }

  async onLogout(): Promise<void> {
    store.set("user", null);
    getDependenciesApi(this.router).set("abilities", []);
    const routesApi = getRoutesApi(this.router);

    routesApi.clear();
    routesApi.add(publicRoutes);
    await this.navigator.navigate("home");
  }
}

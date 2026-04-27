import { Component } from "@angular/core";
import { RouteMatch, RouteNotFound, RouteView } from "@real-router/angular";

import { AboutComponent } from "./pages/about.component";
import { HomeComponent } from "./pages/home.component";
import { ProductsComponent } from "./pages/products.component";
import { QueryDemoComponent } from "./pages/query-demo.component";
import { Layout } from "../../../shared/Layout";

const LINKS = [
  { routeName: "home", label: "Home" },
  { routeName: "about", label: "About" },
  { routeName: "products", label: "Products" },
  { routeName: "queryDemo", label: "Query demo" },
];

@Component({
  selector: "app-root",
  imports: [
    Layout,
    RouteView,
    RouteMatch,
    RouteNotFound,
    HomeComponent,
    AboutComponent,
    ProductsComponent,
    QueryDemoComponent,
  ],
  // data-route-root marks the container VT should snapshot. Pseudo-elements
  // ::view-transition-old/new target this through the root transition. Keep
  // it as the single wrapper around route-view; nested VT names apply on
  // descendants (e.g. product covers for hero morph, product-list for
  // per-area scoped transitions).
  template: `
    <app-layout title="Real-Router — View Transitions" [links]="links">
      <div data-route-root>
        <route-view [routeNode]="''">
          <ng-template routeMatch="home"><home-page /></ng-template>
          <ng-template routeMatch="products"><products-page /></ng-template>
          <ng-template routeMatch="about"><about-page /></ng-template>
          <ng-template routeMatch="queryDemo"><query-demo-page /></ng-template>
          <ng-template routeNotFound>
            <h1>404 — Page Not Found</h1>
            <p>The page you are looking for does not exist.</p>
          </ng-template>
        </route-view>
      </div>
    </app-layout>
  `,
})
export class AppComponent {
  readonly links = LINKS;
}

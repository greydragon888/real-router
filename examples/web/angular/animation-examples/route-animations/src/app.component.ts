import { Component } from "@angular/core";
import {
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { installHeroMorph } from "./animations/hero-morph";
import { installListFlip } from "./animations/list-flip";
import { installPageAnimator } from "./animations/page-animator";
import { AboutComponent } from "./pages/about.component";
import { HomeComponent } from "./pages/home.component";
import { ProductDetailComponent } from "./pages/product-detail.component";
import { ProductsListComponent } from "./pages/products-list.component";
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
    RouteMatch,
    RouteNotFound,
    RouteSelf,
    RouteView,
    HomeComponent,
    AboutComponent,
    ProductsListComponent,
    ProductDetailComponent,
    QueryDemoComponent,
  ],
  // No `data-route-root` on this outer wrapper. The marker lives on
  // each leaf page's outermost contentful element. The page-level
  // factory queries `[data-route-root]` and finds exactly one — the
  // active leaf. For products ↔ products.detail, the marker swaps
  // between ProductsList and ProductDetail (each marks its own root).
  template: `
    <app-layout title="Real-Router — Route Animations" [links]="links">
      <route-view [routeNode]="''">
        <ng-template routeMatch="home"><home-page /></ng-template>
        <ng-template routeMatch="products">
          <route-view [routeNode]="'products'">
            <ng-template routeSelf><products-list /></ng-template>
            <ng-template routeMatch="detail"><product-detail /></ng-template>
          </route-view>
        </ng-template>
        <ng-template routeMatch="about"><about-page /></ng-template>
        <ng-template routeMatch="queryDemo"><query-demo-page /></ng-template>
        <ng-template routeNotFound>
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </ng-template>
      </route-view>
    </app-layout>
  `,
})
export class AppComponent {
  readonly links = LINKS;

  // Three thin factories own the app's animation behavior — each calls
  // `injectRouteExit` from `@real-router/angular` once with its own
  // recipe:
  //   - installPageAnimator: page-level fade/slide on cross-route nav
  //   - installHeroMorph: cross-component DOM rect capture (products ↔ detail)
  //   - installListFlip: same-route list reorder + ghost exits
  //     (sort/filter)
  //
  // Constructor runs inside Angular's injection context, so the
  // `inject*` calls inside each factory resolve correctly.
  constructor() {
    installPageAnimator();
    installHeroMorph();
    installListFlip();
  }
}

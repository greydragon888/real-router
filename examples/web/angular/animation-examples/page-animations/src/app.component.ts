import { Component } from "@angular/core";
import {
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

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
  template: `
    <app-layout title="Real-Router — Page Animations" [links]="links">
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
}

import { Component } from "@angular/core";
import {
  RealLink,
  RouteMatch,
  RouteNotFound,
  RouteSelf,
  RouteView,
} from "@real-router/angular";

import { ProductDetailComponent } from "./components/product-detail.component";
import { ProductsListComponent } from "./components/products-list.component";
import { HomeComponent } from "./pages/home.component";
import { NotFoundComponent } from "./pages/not-found.component";

@Component({
  selector: "app-root",
  imports: [
    RealLink,
    RouteView,
    RouteMatch,
    RouteNotFound,
    RouteSelf,
    HomeComponent,
    ProductsListComponent,
    ProductDetailComponent,
    NotFoundComponent,
  ],
  template: `
    <div>
      <header>
        <nav>
          <a realLink routeName="home" data-testid="nav-home">Home</a>
          {{ " | " }}
          <a realLink routeName="products.list" data-testid="nav-products-list">
            Products
          </a>
        </nav>
      </header>
      <main>
        <route-view [routeNode]="''">
          <ng-template routeMatch="home"><home-page /></ng-template>
          <ng-template routeMatch="products">
            <route-view [routeNode]="'products'">
              <ng-template routeMatch="list"><products-list /></ng-template>
              <ng-template routeMatch="detail"><product-detail /></ng-template>
              <ng-template routeSelf><products-list /></ng-template>
            </route-view>
          </ng-template>
          <ng-template routeNotFound>
            <not-found-page />
          </ng-template>
        </route-view>
      </main>
    </div>
  `,
})
export class AppComponent {}

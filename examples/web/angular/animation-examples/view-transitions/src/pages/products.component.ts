import { Component } from "@angular/core";
import { RouteMatch, RouteSelf, RouteView } from "@real-router/angular";

import { ProductDetailComponent } from "./product-detail.component";
import { ProductsListComponent } from "./products-list.component";

@Component({
  selector: "products-page",
  imports: [
    RouteMatch,
    RouteSelf,
    RouteView,
    ProductsListComponent,
    ProductDetailComponent,
  ],
  // Persistent shell — h1 and intro stay mounted across
  // /products ↔ /products/:id navigations. The `products` route IS the list
  // (no synthetic `list` child / `forwardTo`); only `detail` is a real
  // descendant. `routeSelf` template renders ProductsList when the active
  // route is `products` itself; `routeMatch="detail"` wins for /products/:id.
  template: `
    <div>
      <h1>Products</h1>
      <p>
        Click a product card to see the hero-morph transition. The colored
        square on the card smoothly morphs into the large cover on the detail
        page via matching <code>view-transition-name</code>.
      </p>

      <route-view [routeNode]="'products'">
        <ng-template routeSelf><products-list /></ng-template>
        <ng-template routeMatch="detail"><product-detail /></ng-template>
      </route-view>
    </div>
  `,
})
export class ProductsComponent {}

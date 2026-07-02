import type { Routes } from "@angular/router";

import { CatalogItemComponent } from "./pages/catalog-item.component";
import { HomeComponent } from "./pages/home.component";

// wide-config: 1000 flat sibling routes /catalog/item-1..1000. Angular's route
// matcher scans this table on each navigation; withComponentInputBinding() binds
// each route's static `data.n` to the leaf's `n` input so it renders data-n.
const WIDE_COUNT = 1000;

export const routes: Routes = [
  { path: "", component: HomeComponent },
  ...Array.from({ length: WIDE_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      path: `catalog/item-${n}`,
      component: CatalogItemComponent,
      data: { n: String(n) },
    };
  }),
];

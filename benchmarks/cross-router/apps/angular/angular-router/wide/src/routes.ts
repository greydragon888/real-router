import type { Routes } from "@angular/router";

import { CatalogItemComponent } from "./pages/catalog-item.component";
import { HomeComponent } from "./pages/home.component";

// wide-config: WIDE_COUNT flat sibling routes /catalog/item-1..N. Angular's route
// matcher scans this table on each navigation; withComponentInputBinding() binds
// each route's static `data.n` to the leaf's `n` input so it renders data-n.
export const WIDE_TARGETS = [4, 8, 16, 32, 64, 128, 256, 512, 1024] as const; // sweep positions the driver clicks
const WIDE_COUNT = Math.max(...WIDE_TARGETS); // build exactly enough sibling routes

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

import type { Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";
import { SearchLeafComponent } from "./pages/search-leaf.component";

// search-param-scaling: routes with 1/10/50 QUERY params (/sN?k1=v1&…&kN=vN). The
// path is just the /sN segment — query params ride on the link's [queryParams] and
// are exposed by @angular/router via ActivatedRoute.snapshot.queryParams. Inlined:
// angular apps have no _shared dir (mirrors params/src/routes.ts).
const SEARCH_COUNTS = [1, 10, 50] as const;

export const routes: Routes = [
  { path: "", component: HomeComponent },
  ...SEARCH_COUNTS.map((n) => ({
    path: `s${n}`,
    component: SearchLeafComponent,
  })),
];

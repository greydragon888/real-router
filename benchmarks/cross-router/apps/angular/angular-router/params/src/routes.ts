import type { Routes } from "@angular/router";

import { HomeComponent } from "./pages/home.component";
import { ParamLeafComponent } from "./pages/param-leaf.component";

// param-scaling: routes with 1/10/100 path params (/pN/:k1/.../:kN). The matcher
// extracts the params during the segment walk; the leaf counts them (data-count).
const PARAM_COUNTS = [1, 10, 100] as const;

// pattern: pN/:k1/.../:kN  (Angular route paths have no leading slash)
function paramPattern(n: number): string {
  const keys = Array.from({ length: n }, (_, i) => `:k${i + 1}`);
  return `p${n}/${keys.join("/")}`;
}

export const routes: Routes = [
  { path: "", component: HomeComponent },
  ...PARAM_COUNTS.map((n) => ({
    path: paramPattern(n),
    component: ParamLeafComponent,
  })),
];

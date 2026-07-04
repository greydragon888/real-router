import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

// Reads EVERY query value it received (k1, k2, …) — count + checksum (Σ value
// lengths) — so @angular/router's lazy query object is actually materialized,
// apples-to-apples with real-router's eager route.params. Self-contained (inlined,
// like the params leaf) to avoid a routes.ts ↔ leaf import cycle.
function readSearch(entries: Iterable<[string, unknown]>): {
  count: number;
  checksum: number;
} {
  let count = 0;
  let checksum = 0;
  for (const [k, v] of entries) {
    if (!/^k\d+$/.test(k)) continue;
    count += 1;
    checksum += String(v).length;
  }
  return { count, checksum };
}

// s1/s10/s50 are distinct route configs, so navigating between them recreates this
// component — snapshot.queryParams is always the arrived route's query (same
// mechanism as the params leaf reading snapshot.params). count → data-count lets
// the driver confirm arrival at the N-query route.
@Component({
  selector: "search-leaf-page",
  template: `<main data-testid="page-search" [attr.data-count]="count">
    {{ count }} search · Σ{{ checksum }}
  </main>`,
})
export class SearchLeafComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly result = readSearch(
    Object.entries(this.route.snapshot.queryParams),
  );
  readonly count = this.result.count;
  readonly checksum = this.result.checksum;
}

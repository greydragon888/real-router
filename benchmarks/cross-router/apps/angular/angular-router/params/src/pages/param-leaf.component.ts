import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

// Counts the path params it received (k1, k2, …) and reports via data-count, so
// the driver can confirm arrival at the N-param route.
@Component({
  selector: "param-leaf-page",
  template: `<main data-testid="page-param" [attr.data-count]="count()">
    {{ count() }} params
  </main>`,
})
export class ParamLeafComponent {
  private readonly route = inject(ActivatedRoute);
  count(): string {
    const n = Object.keys(this.route.snapshot.params).filter((k) =>
      /^k\d+$/.test(k),
    ).length;
    return String(n);
  }
}

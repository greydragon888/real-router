import { Component, input } from "@angular/core";

// `n` is bound from the route's static `data.n` via withComponentInputBinding().
@Component({
  selector: "catalog-item-page",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>Item {{ n() }}</h1>
  </main>`,
})
export class CatalogItemComponent {
  readonly n = input<string>("");
}

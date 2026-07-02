import { Component, input } from "@angular/core";

// Deep leaf — `data-n` lets the sweep driver confirm it reached depth D.
// Standalone file so the recursive Level component can import it without a
// circular dependency on app.component.ts.
@Component({
  selector: "catalog-item",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>Item {{ n() }}</h1>
  </main>`,
})
export class CatalogItemComponent {
  readonly n = input<string>("");
}

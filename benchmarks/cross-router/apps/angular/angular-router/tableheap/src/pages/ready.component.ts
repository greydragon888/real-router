import { Component, input } from "@angular/core";

// `n` (the route-table size) is bound from the route's static `data.n`.
@Component({
  selector: "ready-page",
  template: `<main data-testid="page-ready" [attr.data-n]="n()">ready</main>`,
})
export class ReadyComponent {
  readonly n = input<string>("");
}

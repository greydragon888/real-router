import { Component, input } from "@angular/core";

// `n` ("a" or "b") is bound from the route's static `data.n`.
@Component({
  selector: "sec-leaf-page",
  template: `<main data-testid="page-item" [attr.data-n]="n()">
    <h1>{{ n() }}</h1>
  </main>`,
})
export class LeafComponent {
  readonly n = input<string>("");
}

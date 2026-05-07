import { Component } from "@angular/core";

@Component({
  selector: "not-found-page",
  template: `
    <main data-testid="not-found">
      <h1>404</h1>
      <p>Route not found.</p>
    </main>
  `,
})
export class NotFoundComponent {}

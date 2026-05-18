import { Component } from "@angular/core";

@Component({
  selector: "not-found-page",
  template: `
    <div data-testid="not-found">
      <h1>404 — Not Found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  `,
})
export class NotFoundComponent {}

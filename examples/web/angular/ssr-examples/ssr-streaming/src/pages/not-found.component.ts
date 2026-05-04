import { Component } from "@angular/core";
import { RealLink } from "@real-router/angular";

@Component({
  selector: "not-found-page",
  imports: [RealLink],
  template: `
    <section data-testid="not-found">
      <h1>404 — Not Found</h1>
      <p><a realLink routeName="home">Go home</a></p>
    </section>
  `,
})
export class NotFoundComponent {}

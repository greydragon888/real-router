import { Component } from "@angular/core";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>Home</h1>
      <p>
        This page is in the main bundle — it loads instantly. Dashboard,
        Analytics, and Settings are lazy-loaded via Angular
        <code>&#64;defer</code>.
      </p>
      <p>
        Click any link in the sidebar to trigger a dynamic chunk load. The
        spinner shows while the chunk downloads. On second visit, chunks are
        cached — no spinner.
      </p>
    </div>
  `,
})
export class HomeComponent {}

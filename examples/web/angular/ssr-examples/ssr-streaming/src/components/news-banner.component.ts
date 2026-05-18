import { Component } from "@angular/core";

@Component({
  selector: "news-banner",
  template: `
    <aside data-testid="news-banner">
      <p>New: free shipping on orders over $100. Hydrated via timer trigger.</p>
    </aside>
  `,
})
export class NewsBannerComponent {}

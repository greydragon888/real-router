import { Component } from "@angular/core";
import { RealLink } from "@real-router/angular";

@Component({
  selector: "home-page",
  imports: [RealLink],
  template: `
    <section data-testid="home-page">
      <h1>Streaming SSR Example</h1>
      <p>
        Demonstrates Angular 21
        <code>&#64;defer (on viewport)</code> +
        <code>&#64;defer (on hover)</code> with incremental hydration — wired
        through <code>&#64;real-router/ssr-data-plugin</code> for critical
        product data.
      </p>
      <p>
        <a realLink routeName="products.list" data-testid="nav-products">
          Browse products
        </a>
      </p>
    </section>
  `,
})
export class HomeComponent {}

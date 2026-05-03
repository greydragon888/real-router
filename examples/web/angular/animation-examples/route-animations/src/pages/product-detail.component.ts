import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  "1": { name: "Crimson Flask", color: "#b91c1c" },
  "2": { name: "Azure Orb", color: "#1d4ed8" },
  "3": { name: "Emerald Prism", color: "#047857" },
  "4": { name: "Amber Cube", color: "#b45309" },
  "5": { name: "Violet Sphere", color: "#6d28d9" },
  "6": { name: "Slate Block", color: "#334155" },
};

@Component({
  selector: "product-detail",
  imports: [RealLink],
  template: `
    @if (product()) {
      <div data-route-root data-route-anim="hero-flip">
        <h2>{{ product()!.name }}</h2>
        <!--
          'data-product-id' is the same stable handle the thumbnail on
          products-list carried. installHeroMorph measures the thumb's
          rect inside injectRouteExit, then applies an inverse-FLIP
          transform to this cover via navigator.subscribe after the new
          page mounts.
        -->
        <div
          class="product-cover"
          [attr.data-product-id]="id()"
          [style.backgroundColor]="product()!.color"
          aria-hidden="true"
        ></div>
        <p>
          The thumbnail morphed into this cover via a
          <a href="https://aerotwist.com/blog/flip-your-animations/">FLIP</a>
          animation: source rect captured on leave (inside the
          <code>injectRouteExit</code> handler in
          <code>installHeroMorph</code>), destination rect measured after commit
          (in <code>navigator.subscribe</code> + <code>setTimeout(0)</code>),
          then the delta plays via <code>element.animate()</code>. The parallel
          <code>view-transitions/</code> example does this with two CSS rules
          and matching <code>view-transition-name</code> — the recipe pays in JS
          for cross-browser support.
        </p>
        <p>
          <a realLink routeName="products" [activeStrict]="true">
            ← Back to products
          </a>
        </p>
      </div>
    } @else {
      <div data-route-root data-route-anim="hero-flip">
        <h2>Unknown product</h2>
        <a realLink routeName="products" [activeStrict]="true">
          Back to products
        </a>
      </div>
    }
  `,
})
export class ProductDetailComponent {
  private readonly state = injectRoute<{ id: string }>();

  readonly id = computed(() => this.state.routeState().route.params.id ?? "1");
  readonly product = computed(() => COVERS[this.id()]);
}

import { Component, computed } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

// Partial lets TS see `COVERS[id]` as possibly undefined for unknown ids,
// so the `!product` fallback branch below is reachable under strict checks.
const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

@Component({
  selector: "product-detail",
  imports: [RealLink],
  template: `
    @if (product(); as p) {
      <h2>{{ p.name }}</h2>
      <!--
        This cover uses the SAME view-transition-name as the thumbnail on the
        Products page. The browser automatically matches them and
        interpolates position + size — a "hero morph" with zero JS.
      -->
      <div
        class="vt-product-cover"
        [attr.data-product-id]="id()"
        [style.backgroundColor]="p.color"
        aria-hidden="true"
      ></div>
      <p>
        Notice how the square morphed from the Products list into this cover.
        The morph is pure CSS: identical <code>view-transition-name</code> on
        both elements → browser pairs them → automatic FLIP-style animation.
      </p>
      <p>
        <a realLink routeName="products" [activeStrict]="true">← Back to products</a>
      </p>
    } @else {
      <h2>Unknown product</h2>
      <a realLink routeName="products" [activeStrict]="true">Back to products</a>
    }
  `,
})
export class ProductDetailComponent {
  private readonly state = injectRoute<{ id: string }>();

  readonly id = computed(() => {
    const params = this.state.routeState().route?.params;
    return typeof params?.id === "string" ? params.id : "1";
  });

  readonly product = computed(() => COVERS[this.id()]);
}

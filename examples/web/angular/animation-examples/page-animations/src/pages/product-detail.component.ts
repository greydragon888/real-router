import { Component, computed, ElementRef, inject } from "@angular/core";
import { injectRoute, RealLink } from "@real-router/angular";

import { installRouteAnimation } from "../route-animation";

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
      <h2>{{ product()!.name }}</h2>
      <div
        class="product-cover"
        [style.backgroundColor]="product()!.color"
        aria-hidden="true"
      ></div>
      <p>
        Note: no hero morph here. The thumbnail on the products page
        slides away with that page; this cover fades in independently.
        Bridging the two requires shared state across components — out
        of scope for the distributed pattern.
      </p>
      <p>
        <a realLink routeName="products" [activeStrict]="true">
          ← Back to products
        </a>
      </p>
    } @else {
      <h2>Unknown product</h2>
      <a realLink routeName="products" [activeStrict]="true">
        Back to products
      </a>
    }
  `,
})
export class ProductDetailComponent {
  private readonly state = injectRoute<{ id: string }>();

  readonly id = computed(() => this.state.routeState().route?.params["id"] ?? "1");
  readonly product = computed(() => COVERS[this.id()]);

  constructor() {
    const hostRef = inject(ElementRef<HTMLElement>);
    installRouteAnimation(hostRef, {
      entryClass: "fade-in",
      exitClass: "fade-out",
    });
  }
}

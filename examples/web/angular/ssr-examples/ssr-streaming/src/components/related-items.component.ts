import { Component, Input } from "@angular/core";

interface RelatedItem {
  id: string;
  name: string;
  price: number;
}

const RELATED_BY_PRODUCT: Record<string, RelatedItem[]> = {
  "1": [
    { id: "k1", name: "Wrist Rest", price: 24.99 },
    { id: "k2", name: "Keycap Puller", price: 6.5 },
  ],
  "2": [
    { id: "m1", name: "Mouse Pad", price: 14.99 },
    { id: "m2", name: "USB-C Hub", price: 39.99 },
  ],
  "3": [
    { id: "d1", name: "Monitor Arm", price: 79 },
    { id: "d2", name: "USB-C Cable", price: 12.99 },
  ],
};

@Component({
  selector: "related-items",
  template: `
    <section data-testid="related-section">
      <h2>You might also like</h2>
      <ul>
        @for (item of items; track item.id) {
          <li [attr.data-related-id]="item.id">
            {{ item.name }} — \${{ item.price }}
          </li>
        }
      </ul>
    </section>
  `,
})
export class RelatedItemsComponent {
  @Input({ required: true }) productId!: string;

  get items(): RelatedItem[] {
    return RELATED_BY_PRODUCT[this.productId] ?? [];
  }
}

import { Component, Input } from "@angular/core";

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
}

const REVIEWS_BY_PRODUCT: Record<string, Review[]> = {
  "1": [
    { id: "r1", author: "Alice", rating: 5, text: "Best keyboard I've owned." },
    { id: "r2", author: "Bob", rating: 4, text: "Great feel, slightly loud." },
  ],
  "2": [{ id: "r3", author: "Carol", rating: 5, text: "Wrist pain gone." }],
  "3": [
    { id: "r4", author: "Dave", rating: 5, text: "Colors are gorgeous." },
    { id: "r5", author: "Eve", rating: 4, text: "Stand wobbles a bit." },
  ],
};

@Component({
  selector: "reviews-section",
  template: `
    @if (reviews.length === 0) {
      <p data-testid="reviews-empty">No reviews yet.</p>
    } @else {
      <section data-testid="reviews-section">
        <h2>Reviews ({{ reviews.length }})</h2>
        <ul>
          @for (r of reviews; track r.id) {
            <li [attr.data-review-id]="r.id">
              <strong>{{ r.author }}</strong> — {{ r.rating }}/5
              <p>{{ r.text }}</p>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class ReviewsComponent {
  @Input({ required: true }) productId!: string;

  get reviews(): Review[] {
    return REVIEWS_BY_PRODUCT[this.productId] ?? [];
  }
}

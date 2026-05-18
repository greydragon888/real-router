import { Component, Input } from "@angular/core";

interface SpecSheet {
  weight: string;
  warranty: string;
  origin: string;
}

const SPECS_BY_PRODUCT: Record<string, SpecSheet> = {
  "1": { weight: "1.2 kg", warranty: "2 years", origin: "Japan" },
  "2": { weight: "0.15 kg", warranty: "1 year", origin: "Taiwan" },
  "3": { weight: "5.4 kg", warranty: "3 years", origin: "South Korea" },
  "5": { weight: "0.3 kg", warranty: "30 days", origin: "Vietnam" },
};

@Component({
  selector: "spec-sheet",
  template: `
    <section data-testid="spec-sheet">
      <h3>Specifications</h3>
      <dl>
        <dt>Weight</dt>
        <dd data-testid="spec-weight">{{ specs.weight }}</dd>
        <dt>Warranty</dt>
        <dd data-testid="spec-warranty">{{ specs.warranty }}</dd>
        <dt>Origin</dt>
        <dd data-testid="spec-origin">{{ specs.origin }}</dd>
      </dl>
    </section>
  `,
})
export class SpecSheetComponent {
  @Input({ required: true }) productId!: string;

  get specs(): SpecSheet {
    return (
      SPECS_BY_PRODUCT[this.productId] ?? {
        weight: "—",
        warranty: "—",
        origin: "—",
      }
    );
  }
}

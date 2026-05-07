import { Component, Input } from "@angular/core";

interface QAEntry {
  q: string;
  a: string;
}

const QA_BY_PRODUCT: Record<string, QAEntry[]> = {
  "1": [
    {
      q: "Is RGB lighting customizable?",
      a: "Yes — per-key, via the desktop app.",
    },
    { q: "Mac compatible?", a: "Yes, USB-C with on-board firmware." },
  ],
  "2": [{ q: "Can I disable the side buttons?", a: "Yes, in the driver." }],
  "3": [
    { q: "Does it support HDR?", a: "HDR10, peak 600 nits." },
    { q: "USB-C power delivery wattage?", a: "90W upstream." },
  ],
};

@Component({
  selector: "qa-section",
  template: `
    <section data-testid="qa-section">
      <h3>Customer Q&amp;A ({{ entries.length }})</h3>
      <ul>
        @for (e of entries; track e.q) {
          <li>
            <strong>Q:</strong> {{ e.q }}
            <br />
            <strong>A:</strong> {{ e.a }}
          </li>
        }
      </ul>
    </section>
  `,
})
export class QAComponent {
  @Input({ required: true }) productId!: string;

  get entries(): QAEntry[] {
    return QA_BY_PRODUCT[this.productId] ?? [];
  }
}

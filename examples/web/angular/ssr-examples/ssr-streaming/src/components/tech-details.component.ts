import { Component, Input } from "@angular/core";

interface TechSpec {
  protocol: string;
  pollingHz: number;
  firmware: string;
}

const TECH_BY_PRODUCT: Record<string, TechSpec> = {
  "1": { protocol: "USB-C 2.0", pollingHz: 1000, firmware: "v3.4.2" },
  "2": { protocol: "Bluetooth 5.3", pollingHz: 500, firmware: "v1.2.0" },
  "3": { protocol: "DisplayPort 2.1", pollingHz: 144, firmware: "v2.0.1" },
};

@Component({
  selector: "tech-details",
  template: `
    <section data-testid="tech-details">
      <h3>Technical details</h3>
      <dl>
        <dt>Protocol</dt>
        <dd data-testid="tech-protocol">{{ spec.protocol }}</dd>
        <dt>Polling Hz</dt>
        <dd data-testid="tech-polling">{{ spec.pollingHz }}</dd>
        <dt>Firmware</dt>
        <dd data-testid="tech-firmware">{{ spec.firmware }}</dd>
      </dl>
    </section>
  `,
})
export class TechDetailsComponent {
  @Input({ required: true }) productId!: string;

  get spec(): TechSpec {
    return (
      TECH_BY_PRODUCT[this.productId] ?? {
        protocol: "—",
        pollingHz: 0,
        firmware: "—",
      }
    );
  }
}

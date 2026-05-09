import { NgTemplateOutlet } from "@angular/common";
import { afterNextRender, Component, input, signal } from "@angular/core";

import type { TemplateRef } from "@angular/core";

@Component({
  selector: "client-only",
  template: `
    @if (mounted()) {
      <ng-content />
    } @else if (fallback()) {
      <ng-container [ngTemplateOutlet]="fallback() ?? null" />
    }
  `,
  imports: [NgTemplateOutlet],
})
export class ClientOnly {
  readonly fallback = input<TemplateRef<unknown>>();

  readonly mounted = signal(false);

  constructor() {
    afterNextRender(() => {
      this.mounted.set(true);
    });
  }
}

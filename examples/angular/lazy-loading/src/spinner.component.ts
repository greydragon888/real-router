import { Component } from "@angular/core";

@Component({
  selector: "app-spinner",
  template: `
    <div style="padding: 24px;">
      <span class="spinner"></span>
      <span style="margin-left: 12px;">Loading chunk…</span>
    </div>
  `,
})
export class SpinnerComponent {}

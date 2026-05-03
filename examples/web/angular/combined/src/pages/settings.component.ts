import { Component, effect, signal } from "@angular/core";

import { store } from "../../../../../shared/store";

import type { OnDestroy } from "@angular/core";

@Component({
  selector: "settings-page",
  template: `
    <div>
      <h1>Settings</h1>
      <div class="card">
        <div class="form-group">
          <label>Display Name</label>
          <input
            [value]="displayName()"
            (input)="displayName.set($any($event.target).value)"
            placeholder="Enter your display name…"
          />
        </div>
        @if (displayName()) {
          <p style="color: #c62828; font-size: 14px;">
            Unsaved changes — navigating away triggers
            <code>canDeactivate</code>.
          </p>
        }
        <button class="primary" style="margin-top: 8px;">Save</button>
      </div>
    </div>
  `,
})
export class SettingsComponent implements OnDestroy {
  readonly displayName = signal("");

  constructor() {
    effect(() => {
      store.set("settings:unsaved", this.displayName() !== "");
    });
  }

  ngOnDestroy(): void {
    store.set("settings:unsaved", false);
  }
}

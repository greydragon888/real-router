import { Component } from "@angular/core";
import { injectNavigator, injectRoute } from "@real-router/angular";

import { useStringParam } from "./use-params";

@Component({
  selector: "params-toolbar",
  template: `
    <div
      style="display: flex; gap: 16px; margin-bottom: 16px; align-items: center;"
    >
      <div>
        <strong>Lang:</strong>
        <button
          [class.primary]="lang() === 'en'"
          (click)="setParam('lang', 'en')"
        >
          EN
        </button>
        <button
          [class.primary]="lang() === 'ru'"
          (click)="setParam('lang', 'ru')"
        >
          RU
        </button>
      </div>
      <div>
        <strong>Theme:</strong>
        <button
          [class.primary]="theme() === 'light'"
          (click)="setParam('theme', 'light')"
        >
          Light
        </button>
        <button
          [class.primary]="theme() === 'dark'"
          (click)="setParam('theme', 'dark')"
        >
          Dark
        </button>
      </div>
      <span style="font-size: 13px; color: #888;">
        URL: <code>?lang={{ lang() }}&theme={{ theme() }}</code>
      </span>
    </div>
  `,
})
export class ParamsToolbarComponent {
  readonly lang = useStringParam("lang", "en");
  readonly theme = useStringParam("theme", "light");

  private readonly route = injectRoute();
  private readonly navigator = injectNavigator();

  setParam(key: string, value: string): void {
    const current = this.route.routeState().route;
    if (!current) return;
    void this.navigator.navigate(
      current.name,
      { ...current.params, [key]: value },
      { reload: true },
    );
  }
}

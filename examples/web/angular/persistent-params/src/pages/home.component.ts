import { Component } from "@angular/core";

import { useStringParam } from "../use-params";

@Component({
  selector: "home-page",
  template: `
    <div>
      <h1>{{ lang() === "ru" ? "Главная" : "Home" }}</h1>
      <p>
        {{
          lang() === "ru"
            ? "Добро пожаловать! Переключите язык или тему в панели выше."
            : "Welcome! Switch language or theme using the toolbar above."
        }}
      </p>
      <p>
        {{
          lang() === "ru"
            ? "Перейдите на другую страницу — параметры сохранятся в URL."
            : "Navigate to another page — the params persist in the URL."
        }}
      </p>
      <div class="card">
        <p>Active lang: <strong>{{ lang() }}</strong></p>
        <p>Active theme: <strong>{{ theme() }}</strong></p>
      </div>
    </div>
  `,
})
export class HomeComponent {
  readonly lang = useStringParam("lang", "en");
  readonly theme = useStringParam("theme", "light");
}

import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRealRouter } from "@real-router/angular";

import { AppComponent } from "./app.component";
import { router } from "./router";

void router.start().then(() => {
  void bootstrapApplication(AppComponent, {
    providers: [provideZonelessChangeDetection(), provideRealRouter(router)],
  }).catch((error: unknown) => {
    console.error(error);
  });
});

import {
  bootstrapApplication,
  provideClientHydration,
} from "@angular/platform-browser";

import { AppComponent } from "./app.component";
import { appConfig } from "./app.config";

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [...(appConfig.providers ?? []), provideClientHydration()],
}).catch((error: unknown) => {
  console.error(error);
});

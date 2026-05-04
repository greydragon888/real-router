import {
  bootstrapApplication,
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from "@angular/platform-browser";

import { AppComponent } from "./app.component";
import { appConfig } from "./app.config";

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...(appConfig.providers ?? []),
    provideClientHydration(withIncrementalHydration(), withEventReplay()),
  ],
}).catch((error: unknown) => {
  console.error(error);
});

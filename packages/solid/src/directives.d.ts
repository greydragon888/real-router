import type { LinkDirectiveOptions } from "./directives/link";

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      link: LinkDirectiveOptions | undefined;
    }
  }
}

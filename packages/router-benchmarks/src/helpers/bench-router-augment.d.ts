import type {
  EventName,
  Options,
  Params,
  State,
  StateMetaInput,
  Unsubscribe,
} from "@real-router/types";

declare module "@real-router/core" {
  interface Router {
    matchPath<P extends Params = Params>(path: string): State<P> | undefined;

    makeState<P extends Params = Params>(
      name: string,
      params?: P,
      path?: string,
      meta?: StateMetaInput,
    ): State<P>;

    forwardState<P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ): { name: string; params: P };

    buildState(routeName: string, routeParams?: Params): State | undefined;

    addEventListener(
      eventName: EventName,
      cb: (...args: any[]) => void,
    ): Unsubscribe;

    getOptions(): Options;

    setRootPath(rootPath: string): void;
    getRootPath(): string;
  }
}

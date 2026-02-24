import type {
  EventName,
  NavigationOptions,
  Options,
  Params,
  State,
  StateMetaInput,
  Unsubscribe,
} from "@real-router/types";

declare module "@real-router/core" {
  interface Router {
    matchPath<P extends Params = Params, MP extends Params = Params>(
      path: string,
    ): State<P, MP> | undefined;

    makeState<P extends Params = Params, MP extends Params = Params>(
      name: string,
      params?: P,
      path?: string,
      meta?: StateMetaInput<MP>,
      forceId?: number,
    ): State<P, MP>;

    forwardState<P extends Params = Params>(
      routeName: string,
      routeParams: P,
    ): { name: string; params: P };

    buildState(routeName: string, routeParams?: Params): State | undefined;

    addEventListener(
      eventName: EventName,
      cb: (...args: any[]) => void,
    ): Unsubscribe;

    navigateToState(
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
    ): Promise<State>;

    getOptions(): Options;

    setRootPath(rootPath: string): void;
    getRootPath(): string;
  }
}

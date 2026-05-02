import type {
  DefaultDependencies,
  Params,
  Router,
} from "@real-router/types";

export type SsrLoaderFn<T> = (params: Params) => Promise<T> | T;

export type SsrLoaderFnFactory<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => SsrLoaderFn<T>;

export type SsrLoaderFactoryMap<
  T,
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = Record<string, SsrLoaderFnFactory<T, Dependencies>>;

export interface SsrLoaderPluginConfig {
  namespace: string;
  errorPrefix: string;
}

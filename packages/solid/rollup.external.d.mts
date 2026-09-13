export interface ExternalManifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** The predicate the Solid bundle hands rollup as `external`, built from its manifest. */
export declare function externalFrom(
  manifest: ExternalManifest,
): (id: string) => boolean;

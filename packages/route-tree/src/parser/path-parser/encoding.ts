// packages/route-node/modules/parser/path-parser/encoding.ts

/**
 * Performance-critical code: string concatenation is 2x faster than template
 * literals/String.raw in V8 hot paths. See benchmarks for details.
 */
/* eslint-disable prefer-template */

/**
 * URL Parameter Encoding/Decoding.
 *
 * We encode using encodeURIComponent but we want to
 * preserve certain characters which are commonly used
 * (sub delimiters and ':')
 *
 * https://www.ietf.org/rfc/rfc3986.txt
 *
 * reserved    = gen-delims / sub-delims
 * gen-delims  = ":" / "/" / "?" / "#" / "[" / "]" / "@"
 * sub-delims  = "!" / "$" / "&" / "'" / "(" / ")"
 *             / "*" / "+" / "," / ";" / "="
 *
 * @module parser/path-parser/encoding
 */

import { DECODING_METHODS, ENCODING_METHODS } from "./constants";

import type { URLParamsEncodingType } from "./types";

/**
 * Encodes a URL parameter value using the specified encoding strategy.
 *
 * For splat parameters (*path), encodes each path segment separately
 * while preserving "/" characters.
 *
 * @param param - The parameter value to encode
 * @param encoding - The encoding strategy to use
 * @param isSpatParam - Whether this is a splat parameter
 * @returns The encoded parameter string
 *
 * @example
 * ```typescript
 * encodeParam('hello world', 'default', false);
 * // => 'hello%20world'
 *
 * encodeParam('docs/readme.md', 'default', true);
 * // => 'docs/readme.md' (splat preserves slashes)
 * ```
 */
export const encodeParam = (
  param: string | number | boolean,
  encoding: URLParamsEncodingType,
  isSpatParam: boolean,
): string => {
  const encoder = ENCODING_METHODS[encoding];
  const str = String(param);

  if (!isSpatParam) {
    return encoder(str);
  }

  // Splat params: encode each segment separately, preserving "/"
  // H6 optimization: string concatenation is 2x faster than template literals
  const segments = str.split("/");
  let result = encoder(segments[0]);

  for (let i = 1; i < segments.length; i++) {
    result += "/" + encoder(segments[i]);
  }

  return result;
};

/**
 * Decodes a URL parameter value using the specified encoding strategy.
 *
 * @param param - The encoded parameter string to decode
 * @param encoding - The encoding strategy to use for decoding
 * @returns The decoded parameter string
 *
 * @example
 * ```typescript
 * decodeParam('hello%20world', 'default');
 * // => 'hello world'
 * ```
 */
export const decodeParam = (
  param: string,
  encoding: URLParamsEncodingType,
): string => DECODING_METHODS[encoding](param);

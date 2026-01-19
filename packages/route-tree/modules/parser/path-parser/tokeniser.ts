// packages/route-node/modules/parser/path-parser/tokeniser.ts

/**
 * Path Pattern Tokenizer.
 *
 * Parses path patterns into tokens for matching and building URLs.
 *
 * @module parser/path-parser/tokeniser
 */

import { RULES } from "./constants";

import type { Token } from "./types";

/**
 * Tokenizes a path pattern string into an array of tokens.
 *
 * Recursively parses the path using tokenization rules defined in constants.
 * Each token represents a segment of the path (static fragment, parameter, etc.).
 *
 * @param str - The path pattern string to tokenize
 * @param tokens - Accumulator array for tokens (used in recursion)
 * @returns Array of parsed tokens
 * @throws Error if path contains unparseable segments
 *
 * @example
 * ```typescript
 * tokenise('/users/:id');
 * // => [
 * //   { type: 'delimiter', match: '/', ... },
 * //   { type: 'fragment', match: 'users', ... },
 * //   { type: 'delimiter', match: '/', ... },
 * //   { type: 'url-parameter', match: ':id', val: ['id'], ... }
 * // ]
 *
 * tokenise('/files/*path');
 * // => [
 * //   { type: 'delimiter', match: '/', ... },
 * //   { type: 'fragment', match: 'files', ... },
 * //   { type: 'delimiter', match: '/', ... },
 * //   { type: 'url-parameter-splat', match: '*path', val: ['path'], ... }
 * // ]
 * ```
 */
export const tokenise = (str: string, tokens: Token[] = []): Token[] => {
  // Look for a matching rule
  const matched = RULES.some((rule) => {
    const match = rule.pattern.exec(str);

    if (!match) {
      return false;
    }

    tokens.push({
      type: rule.name,
      match: match[0],
      val: match.slice(1, 2),
      otherVal: match.slice(2),
      regex: typeof rule.regex === "function" ? rule.regex(match) : rule.regex,
    });

    if (match[0].length < str.length) {
      tokenise(str.slice(match[0].length), tokens);
    }

    return true;
  });

  // If no rules matched, throw an error (possible malformed path)
  if (!matched) {
    throw new Error(`Could not parse path '${str}'`);
  }

  return tokens;
};

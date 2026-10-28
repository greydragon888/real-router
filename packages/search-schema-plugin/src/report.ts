// packages/search-schema-plugin/src/report.ts

import { ERROR_PREFIX } from "./constants";
import { isNumberOrBoolean, issueKey, segmentKey } from "./helpers";

import type { KeyedIssue } from "./helpers";
import type { StandardSchemaV1Issue } from "./types";
import type { Params } from "@real-router/core";

/** Captured at module load, as the plugin's other deciding intrinsics are (#1971). */
const hasOwn = Object.hasOwn;

type Path = KeyedIssue["path"];

/** The last text run's query, with each value tried as its text, and that run's issues about each key the text did not fix. */
export interface TextRun {
  readonly input: Params;
  readonly issues: readonly KeyedIssue[];
}

const DECODING =
  'The schema gets decoded values: under queryParams numberFormat / booleanFormat "auto" (the default) ?q=17 arrives as the number 17, ?q=true as true, and a key without a value as null. A rejected number or boolean — a key\'s value or an array element — is tried once more as its text.';

/**
 * The `mode: "development"` report of a query the schema rejected: a line per
 * issue with the value it is about, as decoded where the text did not fix the
 * key. Such a key is followed by what the last text run said about it, with
 * its values as text, and by each element tried that it named no issue at. How
 * the router decodes is explained only when a rejected value is one it decodes
 * from text — a number, a boolean or `null`.
 */
export function describeRejection(
  routeName: string,
  input: Params,
  issues: readonly StandardSchemaV1Issue[],
  text: TextRun,
): string {
  // The issues about a key's text follow the last issue about the key.
  const last = new Map<string | undefined, StandardSchemaV1Issue>();

  for (const issue of issues) {
    last.set(issueKey(issue), issue);
  }

  const asText = new Map<string, KeyedIssue[]>();

  // eslint-disable-next-line unicorn/prefer-group-by -- `Map.groupBy` is ES2024 (Safari 17.4), and the repo declares no browser floor
  for (const issue of text.issues) {
    const key = String(segmentKey(issue.path[0]));
    const said = asText.get(key) ?? [];

    said.push(issue);
    asText.set(key, said);
  }

  const lines: string[] = [];
  let keyed = false;
  let decoded = false;

  for (const issue of issues) {
    const { path } = issue;

    // As `issueKey` reads it: a path without a length names no key.
    if (!(path && path.length > 0)) {
      lines.push(`  the query as a whole: ${issue.message} — nothing removed`);

      continue;
    }

    const key = String(segmentKey(path[0]));
    const value = valueAt(input, path);

    keyed = true;
    decoded ||= value === null || isNumberOrBoolean(value);
    lines.push(`  ${pathName(path)} ${valueClause(value)}: ${issue.message}`);

    if (last.get(key) === issue) {
      pushTextLines(lines, input, text.input, key, asText.get(key) ?? []);
    }
  }

  return [
    `${ERROR_PREFIX} Route "${routeName}": the schema rejected these search params${keyed ? "; each takes its default value or is removed" : ""}:`,
    ...lines,
    ...(decoded ? [DECODING] : []),
  ].join("\n");
}

/**
 * Pushes onto `lines` what the last text run said about `key`, each issue with its
 * value in `asText`, then each element tried — a number or a boolean as
 * decoded, text in `asText` — that none of those issues names. That an issue
 * names no element does not make its text pass: a rule may name only the first
 * element it refuses, or the array as a whole.
 */
function pushTextLines(
  lines: string[],
  input: Params,
  asText: Params,
  key: string,
  said: readonly KeyedIssue[],
): void {
  const named = new Set<string>();

  for (const { path, message } of said) {
    const value = valueAt(asText, path);

    named.add(String(segmentKey(path[1])));
    lines.push(
      `  ${pathName(path)} as text ${value === undefined ? "is absent" : show(value)}: ${message}`,
    );
  }

  const decoded = valueAt(input, [key]);
  const text = valueAt(asText, [key]);

  if (!Array.isArray(decoded) || !Array.isArray(text)) {
    return;
  }

  const texts: readonly unknown[] = text;

  for (const [index, element] of (decoded as readonly unknown[]).entries()) {
    if (
      isNumberOrBoolean(element) &&
      typeof texts[index] === "string" &&
      !named.has(String(index))
    ) {
      lines.push(
        `  ${pathName([key, index])} as text ${show(texts[index])}: no issue reported`,
      );
    }
  }
}

/**
 * The value at `path`, through own properties only; `undefined` where one is
 * missing. A path outside the spec — a string, an array-like object — is read
 * as `Array.from` reads it.
 */
function valueAt(bag: unknown, path: Path): unknown {
  let value = bag;

  // eslint-disable-next-line unicorn/prefer-spread -- a spread iterates, and an array-like path has no iterator
  for (const segment of Array.from(path)) {
    const key = segmentKey(segment);

    if (typeof value !== "object" || value === null || !hasOwn(value, key)) {
      return undefined;
    }

    value = (value as Readonly<Record<PropertyKey, unknown>>)[key];
  }

  return value;
}

/** `tags[1]` for `["tags", 1]`. */
function pathName(path: Path): string {
  return Array.from(path, (segment, index) => {
    const key = String(segmentKey(segment));

    return index === 0 ? key : `[${key}]`;
  }).join("");
}

/** `= 17 (number)`, or `is absent`. */
function valueClause(value: unknown): string {
  return value === undefined ? "is absent" : `= ${show(value)}`;
}

/**
 * A value as the report prints it: text quoted, a number or a boolean with its
 * type, anything else by its type alone — so the report never reads into it.
 */
function show(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (value === null) {
    return "null";
  }

  if (isNumberOrBoolean(value)) {
    return `${String(value)} (${typeof value})`;
  }

  return `(${Array.isArray(value) ? "array" : typeof value})`;
}

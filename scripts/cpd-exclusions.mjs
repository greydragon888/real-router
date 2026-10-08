// cpd-exclusions.mjs — the region of `sonar-project.properties` that sets
// `sonar.cpd.exclusions`, which `sync-config.mjs` renders from the `ignore` of
// `.jscpd.json`, the configuration of the repository's own duplication gate.
//
// jscpd and Sonar read a pattern differently. jscpd matches each entry, and the
// entry behind `**/`, against a path as it walks it from a scan root given on
// its command line, here a path from the repository root; its `*` crosses `/`,
// and every leading `/` is dropped. Sonar matches a pattern against the path
// from the project root; its `*` stays within a path segment, its `**` crosses
// `/`, and one leading `/` is dropped. So each entry is translated: every
// leading `/` dropped, a lone `*` before `/` written `*/**` and any other lone
// `*` written `**`, and `**/` put in front unless the entry starts with it.
// `cpd-exclusions.test.mjs` holds the translation to the jscpd binary, file by
// file, and holds that jscpd, given this repository's `.jscpd.json`, leaves out
// what the translated list does.
//
// What the translation does not carry is refused, not read: a character other
// than a letter, a digit, `.`, `_`, `-`, `/` or `*`, `**` that is not a whole
// segment, and an empty, `.` or `..` segment. So are the other ways one of the
// two could leave a file out under the scan roots: a `.jscpd.json` that is not
// UTF-8 or holds a byte-order mark or a lone surrogate, a key, a `format` or an
// `absolute` of it, a `lint:duplicates` command or a line of
// `sonar-project.properties` other than the ones named here, and a tracked file
// outside the forms `refusedFiles` accepts. A key set to `null` is refused too:
// jscpd takes it as unset without a word, and on `threshold` that takes the
// gate's threshold off. `JSON.parse` takes more than jscpd 5.3.2 does — a
// number out of the range jscpd parses, `1e400`, or nesting 130 deep drops the
// whole file there; a value of another type, a negative count or a `mode` it
// does not know drops that value; a `similarity` outside (0, 1] it takes as 1,
// and a reporter it does not know it drops — so the test has jscpd judge this
// repository's `.jscpd.json` itself.

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { withoutGitEnv } from "./git-env.mjs";

/** The keys `.jscpd.json` holds: its settings and `"//"`, the reasons. */
export const JSCPD_KEYS = [
  "//",
  "absolute",
  "failOnEmpty",
  "format",
  "gitignore",
  "ignore",
  "minLines",
  "minTokens",
  "mode",
  "reporters",
  "similarity",
  "threshold",
];

/** The formats jscpd checks. `.svelte` is the one SonarCloud does not index. */
export const FORMAT = ["typescript", "tsx", "svelte"];

/** The `lint:duplicates` command; its paths are the scan roots. */
export const DUPLICATES = "jscpd packages/*/src/ shared/ --no-tips";

/**
 * The keys `sonar-project.properties` sets. Another one could change the files
 * Sonar reads: `sonar.inclusions`, a key of SonarJS or of `sonar.scm` among
 * them.
 */
export const SONAR_KEYS = [
  "sonar.coverage.exclusions",
  "sonar.cpd.exclusions",
  "sonar.exclusions",
  "sonar.organization",
  "sonar.projectKey",
  "sonar.projectName",
  "sonar.qualitygate.wait",
  "sonar.sourceEncoding",
  "sonar.test.exclusions",
  "sonar.typescript.tsconfigPath",
];

/** A tracked path under the scan roots of `DUPLICATES`. */
const UNDER_ROOTS = /^(?:packages\/[^/]+\/src|shared)\//;

/** An `.ignore` file in a directory above the scan roots. */
const IGNORE_ABOVE = /^(?:packages\/(?:[^/]+\/)?)?\.ignore$/;

/** A path at or above a scan root, which the shell's glob walks through. */
const ROOT_PATH = /^(?:packages(?:\/[^/]+(?:\/src)?)?|shared)$/;

/** The characters an entry or a Sonar pattern may hold here. */
const PLAIN = /^[A-Za-z0-9._\-/*]+$/;

/**
 * The one form of a property line read here: the key at the start, `=` right
 * after it, and a value without `\\` or `\r`.
 */
const PROPERTY = /^([a-z][A-Za-z0-9.]*)=([^\\\r]*)$/;

/**
 * Directories SonarJS leaves out by default and jscpd does not. SonarJS
 * matches them, and `*.d.ts`, ignoring case.
 */
const SONARJS_DEFAULTS = [
  "bower_components",
  "contrib",
  "dist",
  "external",
  "node_modules",
  "vendor",
];

/** The extensions a file under the roots may have. */
const FORMS = [".json", ".md", ".svelte", ".ts", ".tsx"];

/**
 * SonarJS's test for a bundle, which it leaves out: a comment, then an
 * operator before `function`, within the first 2048 characters.
 */
const BUNDLE = new RegExp(
  String.raw`/\*.*\*/\s*[!;+(]function ?(?: [_$a-zA-Z][_$a-zA-Z0-9]*)?\(`,
  "s",
);

/**
 * The Sonar pattern that leaves out the files a jscpd `ignore` entry does.
 *
 * @param {string} entry
 * @returns {string}
 * @throws {Error} on an entry the translation does not carry, naming it
 */
export function translate(entry) {
  if (typeof entry !== "string" || !PLAIN.test(entry)) {
    throw new Error(
      `.jscpd.json: ignore entry ${JSON.stringify(entry)} holds a character Sonar reads otherwise`,
    );
  }
  const bare = entry.replace(/^\/+/, "");
  const segments = bare.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        (segment.includes("**") && segment !== "**"),
    )
  ) {
    throw new Error(
      `.jscpd.json: ignore entry ${JSON.stringify(entry)} has a segment the translation does not carry`,
    );
  }
  let out = "";
  for (let at = 0; at < bare.length; at++) {
    if (bare.startsWith("**", at)) {
      out += "**";
      at++;
    } else if (bare[at] === "*") {
      out += bare[at + 1] === "/" ? "*/**" : "**";
    } else {
      out += bare[at];
    }
  }
  return out === "**" || out.startsWith("**/") ? out : `**/${out}`;
}

/**
 * `WildcardPattern.toRegexp` of sonar-plugin-api, with `/` as the directory
 * separator.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
export function toRegexp(pattern) {
  const special = "()[]^$.{}+|";
  const slash = (ch) => ch === "/" || ch === "\\";
  let source = "^";
  let at = pattern.startsWith("/") || pattern.startsWith("\\") ? 1 : 0;
  while (at < pattern.length) {
    const ch = pattern[at];
    if (special.includes(ch)) {
      source += `\\${ch}`;
    } else if (ch === "*") {
      if (pattern[at + 1] === "*") {
        if (at + 2 < pattern.length && slash(pattern[at + 2])) {
          source += "(?:.*\\/|)";
          at += 2;
        } else {
          source += ".*";
          at += 1;
        }
      } else {
        source += "[^\\/]*?";
      }
    } else if (ch === "?") {
      source += "[^\\/]";
    } else if (slash(ch)) {
      source += "\\/";
    } else {
      source += ch;
    }
    at++;
  }
  return new RegExp(`${source}$`);
}

/**
 * Whether Sonar's `WildcardPattern.match` takes `path` under `pattern`.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export const sonarMatches = (pattern, path) =>
  toRegexp(pattern).test(path.replace(/^\//, "").replace(/\/$/, ""));

/**
 * Every string of a parsed JSON value, keys among them.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
const strings = (value) =>
  typeof value === "string"
    ? [value]
    : value !== null && typeof value === "object"
      ? Object.entries(value).flatMap(([key, each]) => [key, ...strings(each)])
      : [];

/**
 * `.jscpd.json`, decoded as jscpd decodes it — UTF-8 without a byte-order mark,
 * every string well formed; on anything else jscpd drops the whole file — and
 * held to the keys, the formats, the `absolute` and the `ignore` shape this
 * knows, with no key set to `null`, which jscpd takes as unset without a word.
 * With `absolute`, jscpd would match an entry against the absolute path.
 *
 * @param {string} root
 * @returns {{ ignore: string[] }}
 */
function readJscpd(root) {
  let config;
  try {
    config = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        readFileSync(join(root, ".jscpd.json")),
      ),
    );
  } catch (error) {
    throw new Error(`.jscpd.json: ${error.message}`);
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(".jscpd.json: not an object");
  }
  const odd = strings(config).find((string) => !string.isWellFormed());
  if (odd !== undefined) {
    throw new Error(
      `.jscpd.json: holds ${JSON.stringify(odd)}, a string jscpd does not read`,
    );
  }
  const keys = Object.keys(config).sort();
  if (keys.join() !== JSCPD_KEYS.join()) {
    throw new Error(
      `.jscpd.json: holds the keys ${keys.join(", ")}, where this knows ${JSCPD_KEYS.join(", ")}`,
    );
  }
  const unset = keys.filter((key) => config[key] === null);
  if (unset.length > 0) {
    throw new Error(
      `.jscpd.json: ${unset.join(", ")} set to null, which jscpd takes as unset without a word`,
    );
  }
  if (JSON.stringify(config.format) !== JSON.stringify(FORMAT)) {
    throw new Error(
      `.jscpd.json: format is ${JSON.stringify(config.format)}, where this knows ${JSON.stringify(FORMAT)}`,
    );
  }
  if (config.absolute !== false) {
    throw new Error(
      `.jscpd.json: absolute is ${JSON.stringify(config.absolute)}, where this knows false`,
    );
  }
  if (!Array.isArray(config.ignore) || config.ignore.length === 0) {
    throw new Error(".jscpd.json: ignore is not a non-empty array");
  }
  return config;
}

/**
 * The patterns of `sonar.exclusions`, each held to the same characters as an
 * entry, from a `sonar-project.properties` whose every line is empty, a `#`
 * comment or a `key=value` of `SONAR_KEYS`, each key once.
 *
 * @param {string} root
 * @returns {string[]}
 */
function sonarExclusions(root) {
  const values = new Map();
  for (const line of readFileSync(
    join(root, "sonar-project.properties"),
    "utf8",
  ).split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const [, key, value] = PROPERTY.exec(line) ?? [];
    if (key === undefined || !SONAR_KEYS.includes(key) || values.has(key)) {
      throw new Error(
        `sonar-project.properties: ${JSON.stringify(line)} is not a line this reads`,
      );
    }
    values.set(key, value);
  }
  const patterns = values.has("sonar.exclusions")
    ? values.get("sonar.exclusions").split(",")
    : [];
  const odd = patterns.find((pattern) => !PLAIN.test(pattern));
  if (odd !== undefined) {
    throw new Error(
      `sonar-project.properties: sonar.exclusions holds ${JSON.stringify(odd)}, which this does not read`,
    );
  }
  return patterns;
}

/**
 * The tracked files under the scan roots that one of jscpd and Sonar would
 * leave out and the other would not, beside the `ignore` entries, one reason
 * each, naming the file:
 * - an `.ignore` file in a root, below one or in a directory above it, which
 *   jscpd applies;
 * - a symbolic link at or above a scan root, which the shell's glob and jscpd
 *   walk through and Sonar does not;
 * - under the roots, a symbolic link to a file, which Sonar can index and
 *   jscpd does not, or to nothing; through a link to a directory neither reads;
 * - a hidden path, and a path through a directory SonarJS leaves out by
 *   default;
 * - an extension other than `.ts` and `.tsx`, which both read, `.svelte`,
 *   which only jscpd reads and which is the one accepted difference, and `.md`
 *   and `.json`, which neither reads;
 * - a `.ts` or `.tsx` that is a declaration file no translated entry covers,
 *   under a pattern of `sonar.exclusions`, over 1,000,000 bytes (between the
 *   two tools' limits), not UTF-8, or in the form SonarJS takes for a bundle.
 *
 * Of a tracked file missing from the working tree, a deletion not staged yet,
 * only the path is judged.
 *
 * @param {string} root
 * @param {string[]} exclusions the patterns of `sonar.exclusions`
 * @param {string[]} patterns the translated entries of `ignore`
 * @returns {string[]}
 */
export function refusedFiles(root, exclusions, patterns) {
  const rows = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: root,
    encoding: "utf8",
    env: withoutGitEnv(process.env),
    maxBuffer: 64 * 1024 * 1024,
  }).split("\0");

  const refused = [];
  for (const row of rows) {
    if (row === "") continue;
    const mode = row.slice(0, 6);
    const path = row.slice(row.indexOf("\t") + 1);
    let reason;
    if (UNDER_ROOTS.test(path)) {
      reason = formReason(root, path, mode, { exclusions, patterns });
    } else if (IGNORE_ABOVE.test(path)) {
      reason = "an .ignore file, which jscpd applies";
    } else if (mode === "120000" && ROOT_PATH.test(path)) {
      reason =
        "a symbolic link at or above a scan root, which jscpd walks through and Sonar does not";
    }
    if (reason !== undefined) refused.push(`${path}: ${reason}`);
  }
  return refused;
}

/**
 * Why `refusedFiles` refuses a tracked path under the roots, or `undefined`.
 *
 * @param {string} root
 * @param {string} path
 * @param {string} mode the git mode of its index entry
 * @param {{ exclusions: string[], patterns: string[] }} scope
 * @returns {string | undefined}
 */
function formReason(root, path, mode, { exclusions, patterns }) {
  const segments = path.split("/");
  if (segments.at(-1) === ".ignore") {
    return "an .ignore file, which jscpd applies";
  }
  if (mode === "120000") {
    if (lstatSync(join(root, path), { throwIfNoEntry: false }) === undefined) {
      return undefined;
    }
    let target;
    try {
      target = statSync(join(root, path));
    } catch {
      return "a symbolic link that leads nowhere";
    }
    return target.isDirectory()
      ? undefined
      : "a symbolic link to a file, which Sonar can index and jscpd does not";
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    return "a hidden path, which jscpd reads and SonarJS does not";
  }
  const left = segments.find((segment) =>
    SONARJS_DEFAULTS.includes(segment.toLowerCase()),
  );
  if (left !== undefined) {
    return `under ${left}/, which SonarJS leaves out by default`;
  }
  const extension = /\.[^./]+$/.exec(path)?.[0];
  if (!FORMS.includes(extension)) {
    return "a form the two tools do not read alike";
  }
  if (extension !== ".ts" && extension !== ".tsx") return undefined;
  if (
    /\.d\.ts$/i.test(path) &&
    !patterns.some((pattern) => sonarMatches(pattern, path))
  ) {
    return "a declaration file, which SonarJS leaves out by default and no ignore entry does";
  }
  const pattern = exclusions.find((each) => sonarMatches(each, path));
  if (pattern !== undefined) {
    return `under ${pattern} of sonar.exclusions, which leaves it out of Sonar and not of jscpd`;
  }
  if (lstatSync(join(root, path), { throwIfNoEntry: false }) === undefined) {
    return undefined;
  }
  const bytes = readFileSync(join(root, path));
  if (bytes.length > 1_000_000) {
    return "over 1,000,000 bytes, between the two tools' limits";
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "not UTF-8, which jscpd leaves out and Sonar reads";
  }
  return BUNDLE.test(text.slice(0, 2048))
    ? "in the form SonarJS takes for a bundle and leaves out, which jscpd reads"
    : undefined;
}

/**
 * The region's lines: the translated `ignore`, in `.jscpd.json`'s order.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function render(root) {
  const { ignore } = readJscpd(root);
  const script = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    .scripts?.["lint:duplicates"];
  if (script !== DUPLICATES) {
    throw new Error(
      `package.json: lint:duplicates is ${JSON.stringify(script)}, where this knows ${JSON.stringify(DUPLICATES)}`,
    );
  }
  const patterns = ignore.map(translate);
  const refused = refusedFiles(root, sonarExclusions(root), patterns);
  if (refused.length > 0) throw new Error(refused.join("; "));
  return [`sonar.cpd.exclusions=${patterns.join(",")}`];
}

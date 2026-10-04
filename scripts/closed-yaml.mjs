// closed-yaml.mjs — YAML read closed: the `yaml` parser, and a refusal of each
// form GitHub's reader may take otherwise and of each form the readers here do
// not read.
//
// GitHub types a plain value by the YAML 1.2 core schema, as `yaml` does, so a
// value needs no refusal. Refused:
//   - a lone CR, NEL, LS or PS, at which GitHub's scanner breaks a line and
//     `yaml` does not, and a tab or another control character: the set
//     `REFUSED_CHARACTERS` names, which the line readers of workflows share;
//   - a BOM or a no-break space anywhere: content to every reader, and
//     invisible to whoever reads the file;
//   - a directive, a text that is not one document, a parse error or warning,
//     and a duplicate key;
//   - an alias — the parser leaves one to an anchor the file lacks to
//     whoever resolves it — an anchor, an explicit tag, a merge key `<<` and
//     a key that is not a scalar. GitHub reads anchors and aliases; the
//     readers here take each node as written.
// A refusal throws `ClosedYamlError`; one at a node names the keys above it.

import { isPair, isScalar, parseAllDocuments, visit } from "yaml";

import { REFUSED_CHARACTERS } from "./refused-characters.mjs";

export class ClosedYamlError extends Error {}

/** A BOM and a no-break space: content to every reader, and invisible. */
const INVISIBLE = /[\uFEFF\u00A0]/;

/**
 * Where a node sits: the keys of the pairs above it, joined by dots.
 *
 * @param {readonly unknown[]} path the ancestors `visit` passes
 * @returns {string}
 */
function where(path) {
  const keys = path
    .filter(isPair)
    .map((pair) => (isScalar(pair.key) ? String(pair.key.value) : "?"));
  return keys.length > 0 ? keys.join(".") : "the top level";
}

/**
 * The one document of `text`, read closed.
 *
 * @param {string} text
 * @returns {import("yaml").Document.Parsed}
 * @throws {ClosedYamlError} on any form the header names
 */
export function readClosedYaml(text) {
  if (REFUSED_CHARACTERS.test(text)) {
    throw new ClosedYamlError(
      "a character the readers here refuse: a line break other than LF, a tab or another control character",
    );
  }
  if (INVISIBLE.test(text)) {
    throw new ClosedYamlError(
      "an invisible character: a BOM or a no-break space",
    );
  }
  if (/^%/m.test(text)) throw new ClosedYamlError("a directive");

  const docs = parseAllDocuments(text, { uniqueKeys: true });

  if (!Array.isArray(docs) || docs.length !== 1) {
    throw new ClosedYamlError("not exactly one document");
  }

  const [doc] = docs;
  const [problem] = [...doc.errors, ...doc.warnings];

  if (problem) throw new ClosedYamlError(problem.message);

  // `visit` hands a scalar to `Scalar` alone, so both visitors ask this.
  const refuseMarks = (node, path) => {
    if (node.anchor) throw new ClosedYamlError(`an anchor at ${where(path)}`);
    if (node.tag) throw new ClosedYamlError(`a tag at ${where(path)}`);
  };

  visit(doc, {
    Alias(_, node, path) {
      throw new ClosedYamlError(`an alias at ${where(path)}`);
    },
    Node(_, node, path) {
      refuseMarks(node, path);
    },
    Pair(_, pair, path) {
      if (!isScalar(pair.key)) {
        throw new ClosedYamlError(
          `a key that is not a scalar at ${where(path)}`,
        );
      }
      if (pair.key.value === "<<") {
        throw new ClosedYamlError(`a merge key at ${where(path)}`);
      }
    },
    Scalar(_, node, path) {
      refuseMarks(node, path);
    },
  });

  return doc;
}

/**
 * A scalar's text as the file writes it, quotes included.
 *
 * @param {string} text the text the document was read from
 * @param {import("yaml").Scalar} node
 * @returns {string}
 */
export function sourceOf(text, node) {
  return text.slice(node.range[0], node.range[1]);
}

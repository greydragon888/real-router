// raiser-text-equality.mjs — a converted refusal must render the same message.
//
// Snapshots every message head+body from `origin/master`, synthesises the same from
// the bindings in the working tree, and compares the two sets. Run it on every family
// a conversion touches: `node scripts/raiser-text-equality.mjs`.
//
// ⚠ It is not optional where the suite looks sufficient. Measured on the first
// multi-file family: 19 of 30 converted sites were pinned verbatim by a test and 11
// were not, and this guard caught a real defect in one of the eleven — a `" + "`
// junction left inside the message, invisible to a green suite.
//
// It reads the working tree against `origin/master`, so it measures a conversion in
// progress, not a committed one.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const files = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".ts"));
const PLAIN = new Set(["TypeError", "Error", "ReferenceError", "RangeError"]);

const shape = (n, s) => {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return n.text;
  if (ts.isTemplateExpression(n))
    return (
      n.head.text + n.templateSpans.map((x) => "${}" + x.literal.text).join("")
    );
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return shape(n.left, s) + shape(n.right, s);
  return undefined;
};
const parse = (name, text) =>
  ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);

const before = new Set(),
  after = new Set();

for (const f of files) {
  // BEFORE: master's literal heads
  const old = execFileSync("git", ["show", `origin/master:${f}`], {
    encoding: "utf8",
  });
  const so = parse(f, old);
  const walkOld = (n) => {
    if (
      ts.isThrowStatement(n) &&
      ts.isNewExpression(n.expression) &&
      PLAIN.has(n.expression.expression.getText(so))
    ) {
      const a = n.expression.arguments?.[0];
      const t = a ? shape(a, so) : undefined;
      if (t && /^\[router(\.[A-Za-z]+)?\]\s/.test(t)) before.add(t);
    }
    ts.forEachChild(n, walkOld);
  };
  walkOld(so);

  // AFTER: head from the binding + body from the tag
  const now = readFileSync(f, "utf8");
  const sn = parse(f, now);
  const heads = new Map();
  const collect = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(sn) === "raiser"
    ) {
      const [r, d] = n.initializer.arguments;
      if (r && ts.isStringLiteral(r))
        heads.set(
          n.name.text,
          d && ts.isStringLiteral(d)
            ? `[${r.text}.${d.text}] `
            : `[${r.text}] `,
        );
    }
    ts.forEachChild(n, collect);
  };
  collect(sn);
  const walkNew = (n) => {
    if (ts.isThrowStatement(n) && ts.isTaggedTemplateExpression(n.expression)) {
      const tag = n.expression.tag;
      const member = ts.isCallExpression(tag) ? tag.expression : tag;
      if (
        ts.isPropertyAccessExpression(member) &&
        ts.isIdentifier(member.expression)
      ) {
        const head = heads.get(member.expression.text);
        if (head !== undefined)
          after.add(head + shape(n.expression.template, sn));
      }
    }
    ts.forEachChild(n, walkNew);
  };
  walkNew(sn);
}

const missing = [...before].filter((x) => !after.has(x));
const extra = [...after].filter((x) => !before.has(x));
console.log(`  before: ${before.size}   after: ${after.size}`);
console.log(`  lost:   ${missing.length}   new: ${extra.length}`);
for (const x of [...missing, ...extra].slice(0, 6))
  console.log(`     ${x.slice(0, 92)}`);

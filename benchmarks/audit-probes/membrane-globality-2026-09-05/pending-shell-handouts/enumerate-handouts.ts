// Tool control for the pending-shell-handout lens: derive the DENOMINATOR from
// the source rather than from memory.
//
//  1. the hook / listener SIGNATURES that receive a State (types/router.ts,
//     types/api.ts, types/constants.ts) — TS parser, no type-checker;
//  2. every site in core src that HANDS a State to application code: the
//     `#emitter.emit(events.X, …)` calls, the `listener(leaveState)` call, the
//     two `guardFn(…)` invocations — and every caller of the `emitTransition*` /
//     `awaitLeaveListeners` methods, with the argument text, so "which object
//     goes out" is read off the code;
//  3. the producers of a WRITABLE shell (`materializePending`, `#copyChannels`)
//     and the one site that freezes it (`completeTransition`).
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/pending-shell-handouts/enumerate-handouts.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";

const ROOT = path.resolve(process.cwd(), "..");
const CORE = path.join(ROOT, "packages/core/src");

const files = execSync("git ls-files packages/core/src", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".ts"));

console.log(`# core src files (git ls-files, *.ts): ${files.length}`);

function parse(rel: string): ts.SourceFile {
  const full = path.join(ROOT, rel);

  return ts.createSourceFile(full, readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
}

const norm = (s: string): string => s.replaceAll(/\s+/g, " ").trim();

// ---------------------------------------------------------------- 1. signatures
const SIGNATURE_TARGETS: { file: string; names: string[] }[] = [
  {
    file: "packages/core/src/types/router.ts",
    names: ["GuardFn", "GuardFnFactory", "Plugin", "SubscribeState", "SubscribeFn", "LeaveState", "LeaveFn"],
  },
  {
    file: "packages/core/src/types/api.ts",
    names: ["InterceptableMethodMap", "InterceptorFn", "ContextNamespaceClaim"],
  },
  { file: "packages/core/src/types/constants.ts", names: ["EventMethodMap", "EventToNameMap"] },
];

function memberText(m: ts.TypeElement, sf: ts.SourceFile): string {
  return norm(m.getText(sf));
}

console.log("\n## 1. signatures that receive a State (from the type declarations)");
for (const target of SIGNATURE_TARGETS) {
  const sf = parse(target.file);
  const found = new Set<string>();

  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && target.names.includes(node.name.text)) {
      found.add(node.name.text);
      console.log(`\n### ${target.file} · interface ${node.name.text} — ${node.members.length} members`);
      for (const m of node.members) {
        console.log(`  ${memberText(m, sf)}`);
      }
    }

    if (ts.isTypeAliasDeclaration(node) && target.names.includes(node.name.text)) {
      found.add(node.name.text);
      console.log(`\n### ${target.file} · type ${node.name.text}`);
      console.log(`  ${norm(node.type.getText(sf))}`);
    }
  });

  for (const name of target.names) {
    if (!found.has(name)) {
      console.log(`\n!! NOT FOUND: ${target.file} · ${name}`);
    }
  }
}

// PluginApi.addEventListener — the second way a plugin subscribes to the same hooks.
{
  const sf = parse("packages/core/src/types/api.ts");

  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "PluginApi") {
      for (const m of node.members) {
        const name = (m as { name?: ts.Node }).name?.getText(sf);

        if (name === "addEventListener" || name === "claimContextNamespace" || name === "navigateToState") {
          console.log(`\n### types/api.ts · PluginApi.${name}\n  ${memberText(m, sf)}`);
        }
      }
    }
  });
}

// ---------------------------------------------------------------- 2. handout sites
interface Site {
  file: string;
  enclosing: string;
  callee: string;
  args: string[];
}

const HANDOUT_CALLEES = new Set([
  "emit",
  "emitTransitionStart",
  "emitTransitionLeaveApprove",
  "emitTransitionCancel",
  "emitTransitionError",
  "emitTransitionSuccess",
  "awaitLeaveListeners",
  "sendNavigate",
  "sendLeaveApprove",
  "sendComplete",
  "guardFn",
  "listener",
  "materializePending",
  "materialize",
  "freezeStateShell",
  "canNavigateTo",
  "canDeactivateCurrent",
]);

function enclosingName(node: ts.Node, sf: ts.SourceFile): string {
  let cur: ts.Node | undefined = node.parent;

  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur)) {
      return cur.name?.getText(sf) ?? "<anon>";
    }

    if (ts.isVariableDeclaration(cur) && (ts.isArrowFunction(cur.initializer!) || ts.isFunctionExpression(cur.initializer!))) {
      return cur.name.getText(sf);
    }

    if (ts.isPropertyAssignment(cur) && (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))) {
      return cur.name.getText(sf);
    }

    cur = cur.parent;
  }

  return "<module>";
}

const sites: Site[] = [];

for (const rel of files) {
  const sf = parse(rel);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const callee = ts.isPropertyAccessExpression(expr)
        ? expr.name.text
        : ts.isIdentifier(expr)
          ? expr.text
          : undefined;

      if (callee !== undefined && HANDOUT_CALLEES.has(callee)) {
        // `emit` only from the router's own emitter — skip the generic `EventEmitter` class body.
        if (callee === "emit" && !rel.includes("EventBusNamespace")) {
          // still listed, but tagged
        }

        sites.push({
          file: rel.replace("packages/core/src/", ""),
          enclosing: enclosingName(node, sf),
          callee,
          args: node.arguments.map((a) => norm(a.getText(sf))),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
}

console.log("\n## 2. call sites by callee (file · enclosing function · arguments)");
const byCallee = new Map<string, Site[]>();

for (const s of sites) {
  byCallee.set(s.callee, [...(byCallee.get(s.callee) ?? []), s]);
}

for (const callee of [...HANDOUT_CALLEES]) {
  const list = byCallee.get(callee) ?? [];

  console.log(`\n### ${callee} — ${list.length} site(s)`);
  for (const s of list) {
    console.log(`  ${s.file} · ${s.enclosing} · (${s.args.join(", ")})`);
  }
}

// ---------------------------------------------------------------- 3. the seed
const seedFile = "packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts";
const seedText = readFileSync(path.join(ROOT, seedFile), "utf8");
const seeds = [
  "this.emitTransitionStart(payload.toState, payload.fromState, scope)",
  "this.emitTransitionLeaveApprove(payload.toState, payload.fromState)",
  "nextRoute: toState",
  "this.emitTransitionCancel(inflight.toState, fromState)",
];

console.log("\n## 3. seed control — the gap's own handout lines are present in the scanned text");
for (const seed of seeds) {
  console.log(`  ${seedText.includes(seed) ? "FOUND" : "!! MISSING"}  ${seed}`);
}

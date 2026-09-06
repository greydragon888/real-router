// CONTROL ARM for the "object = identity key" class, declared BEFORE measuring:
//   rule — every `new WeakMap` in core src whose key type is an object; expected class
//   members are the four keyed by the app-facing router handle (internals.ts · internals,
//   getPluginApi.ts · cache, getRoutesApi.ts · cache, getNavigator.ts · cache); the control
//   is the one keyed by a core-owned object (utils/fsm/fsm.ts · NORMALIZED, keyed by the FSM
//   table). The control HOLDS if no public entry point can hand an app object to it —
//   proved by enumerating the runtime exports of every public entry, not by reading.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import * as core from "@real-router/core";
import * as api from "@real-router/core/api";
import * as utils from "@real-router/core/utils";
import * as validation from "@real-router/core/validation";

const root = path.resolve(__dirname, "../../../..");

function trackedCoreSrc(): string[] {
  return execFileSync("git", ["ls-files", "packages/core/src"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") && !f.includes("/tests/") && !f.endsWith(".test.ts"));
}

function main(): void {
  const files = trackedCoreSrc();
  const weakMapSites: string[] = [];

  for (const file of files) {
    const text = readFileSync(path.join(root, file), "utf8");
    const lines = text.split("\n");

    for (const line of lines) {
      if (/new WeakMap\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
        weakMapSites.push(`${file} · ${line.trim().slice(0, 70)}`);
      }
    }
  }

  const entries: Record<string, string[]> = {
    "@real-router/core": Object.keys(core),
    "@real-router/core/api": Object.keys(api),
    "@real-router/core/utils": Object.keys(utils),
    "@real-router/core/validation": Object.keys(validation),
  };
  const all = Object.values(entries).flat();
  const identityDoorExports = [
    "getInternals",
    "getNavigator",
    "getPluginApi",
    "getRoutesApi",
    "getDependenciesApi",
    "getLifecycleApi",
    "cloneRouter",
  ];

  console.log(
    JSON.stringify(
      {
        "tracked core src files scanned": files.length,
        "new WeakMap sites (denominator)": weakMapSites,
        "runtime exports per public entry": Object.fromEntries(
          Object.entries(entries).map(([k, v]) => [k, v.length]),
        ),
        "positive control: identity-door exports found": identityDoorExports.filter((n) =>
          all.includes(n),
        ),
        "control arm: exports matching /fsm|normal|table/i (expect none)": all.filter((n) =>
          /fsm|normal|table/i.test(n),
        ),
        "control arm: any export whose value is a class named FSM (expect none)": all.filter(
          (n) => {
            const v =
              (core as Record<string, unknown>)[n] ??
              (api as Record<string, unknown>)[n] ??
              (utils as Record<string, unknown>)[n] ??
              (validation as Record<string, unknown>)[n];

            return typeof v === "function" && v.name === "FSM";
          },
        ),
      },
      null,
      2,
    ),
  );
}

main();

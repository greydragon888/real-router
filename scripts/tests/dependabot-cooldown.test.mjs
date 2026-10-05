// dependabot-cooldown.test.mjs — every entry of `.github/dependabot.yml` waits
// at least seven days before it proposes a release.
//
// Run:  node --test scripts/tests/dependabot-cooldown.test.mjs
//
// zizmor 1.30.1's `dependabot-cooldown` audit (`pnpm lint:workflow-security`)
// stops at the first entry that waits long enough, so it misses a later one
// that does not; this test reads them all. A `cooldown` holds `default-days`
// alone, an integer from seven to 90, GitHub's maximum: a per-update-type day
// count or an `include`/`exclude` list is refused rather than read.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readClosedYaml } from "../closed-yaml.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAYS = 7;
const MAX_DAYS = 90;

/**
 * The entries of a dependabot.yml whose `cooldown` is missing, holds more
 * than `default-days`, or waits fewer than `DAYS` or more than `MAX_DAYS`
 * days, as "index ecosystem".
 *
 * @param {string} text
 * @returns {string[]}
 */
function unsoundCooldowns(text) {
  const { updates } = readClosedYaml(text).toJS();
  assert.ok(Array.isArray(updates) && updates.length > 0, "no updates");
  return updates.flatMap((entry, index) => {
    const cooldown = entry.cooldown;
    const sound =
      cooldown !== null &&
      typeof cooldown === "object" &&
      Object.keys(cooldown).join() === "default-days" &&
      Number.isInteger(cooldown["default-days"]) &&
      cooldown["default-days"] >= DAYS &&
      cooldown["default-days"] <= MAX_DAYS;
    return sound ? [] : [`${index} ${entry["package-ecosystem"]}`];
  });
}

test("every Dependabot entry waits at least seven days", () => {
  const text = readFileSync(join(ROOT, ".github", "dependabot.yml"), "utf8");

  assert.deepEqual(unsoundCooldowns(text), []);
});

test("an entry after a sound one is read too, and only `default-days` is taken", () => {
  const entry = (ecosystem, cooldown = []) =>
    [
      `  - package-ecosystem: "${ecosystem}"`,
      '    directory: "/"',
      "    schedule:",
      '      interval: "weekly"',
      ...cooldown,
    ].join("\n");
  const days = (n) => ["    cooldown:", `      default-days: ${n}`];
  const file = (...entries) =>
    ["version: 2", "updates:", ...entries, ""].join("\n");

  assert.deepEqual(
    unsoundCooldowns(file(entry("npm", days(7)), entry("github-actions"))),
    ["1 github-actions"],
  );
  assert.deepEqual(
    unsoundCooldowns(file(entry("npm", days(7)), entry("npm", days(6)))),
    ["1 npm"],
  );
  assert.deepEqual(
    unsoundCooldowns(
      file(
        entry("npm", days(7)),
        entry("npm", [...days(7), "      semver-patch-days: 1"]),
      ),
    ),
    ["1 npm"],
  );
  assert.deepEqual(
    unsoundCooldowns(file(entry("npm", days(6)), entry("npm", days(7)))),
    ["0 npm"],
  );
  assert.deepEqual(
    unsoundCooldowns(
      file(entry("npm", ["    cooldown:", '      default-days: "7"'])),
    ),
    ["0 npm"],
  );
  assert.deepEqual(unsoundCooldowns(file(entry("npm", days(91)))), ["0 npm"]);
  assert.deepEqual(
    unsoundCooldowns(file(entry("npm", days(7)), entry("npm", days(90)))),
    [],
  );
});
